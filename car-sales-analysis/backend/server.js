const express = require('express');
const cors = require('cors');
const multer = require('multer');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const eventStore = require('./utils/eventStore');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// 中间件
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// 本地上传目录（用于本地测试与静态访问）
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));
app.use('/admin', express.static(path.join(__dirname, 'public', 'admin')));

// 配置multer用于文件上传（本地写盘，便于本地预览与调试）
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    // 简单清理文件名中的空白
    const safeName = file.originalname.replace(/\s+/g, '_');
    cb(null, `${timestamp}-${safeName}`);
  }
});
const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 20 // 最多20个文件
  },
  fileFilter: (req, file, cb) => {
    // 只允许图片文件
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('只允许上传图片文件'));
    }
  }
});

// API路由
app.post('/api/analyze', upload.array('files', 20), async (req, res) => {
  try {
    // 检查是否有足够的图片
    if (!req.files || req.files.length < 5) {
      // 在 SAMPLE_MODE 下，为了能走通外部模型验证，允许放宽本地图片限制
      if (String(process.env.SAMPLE_MODE).toLowerCase() !== 'true') {
        return res.status(400).json({
          error: '至少需要上传5张图片',
          code: 'INSUFFICIENT_IMAGES'
        });
      }
    }

    if (req.files.length > 20) {
      return res.status(400).json({
        error: '最多只能上传20张图片',
        code: 'TOO_MANY_IMAGES'
      });
    }

    // 构造可被前端与本地服务访问的图片URL（注意：云端模型无法访问 localhost）
    let imageUrls = (req.files || []).map(f => {
      const filename = path.basename(f.filename || '');
      return `${req.protocol}://${req.get('host')}/uploads/${filename}`;
    });

    const startTs = Date.now();

    // 本地测试模式：直接返回模拟结果，便于联调前端
    if (String(process.env.MOCK_MODE).toLowerCase() === 'true') {
      const mock = buildMockResult();
      return res.json({
        task_id: String(startTs),
        result: mock,
        latency_ms: Date.now() - startTs
      });
    }

    // 仅用于外部模型验证：使用公开可访问的样例图片（Ark文档示例）
    if (String(process.env.SAMPLE_MODE).toLowerCase() === 'true') {
      imageUrls = [
        'https://ark-project.tos-cn-beijing.volces.com/doc_image/ark_demo_img_1.png',
        'https://ark-project.tos-cn-beijing.volces.com/doc_image/ark_demo_img_1.png',
        'https://ark-project.tos-cn-beijing.volces.com/doc_image/ark_demo_img_1.png',
        'https://ark-project.tos-cn-beijing.volces.com/doc_image/ark_demo_img_1.png',
        'https://ark-project.tos-cn-beijing.volces.com/doc_image/ark_demo_img_1.png',
      ];
    }

    // 调用Doubao API（需要可被上游访问的公网图片URL）
    let result;
    try {
      const modelRaw = await callDoubaoAPI(imageUrls);
      result = normalizeModelOutput(modelRaw);
    } catch (err) {
      // 上游失败时可降级为本地模拟，保证前端可测试
      const allowFallback = String(process.env.ALLOW_FALLBACK || 'true').toLowerCase() === 'true';
      const status = err?.response?.status;
      const detail = err?.response?.data?.error || err?.message || 'unknown error';
      console.error('上游调用失败:', { status, detail });
      if (allowFallback) {
        result = { ...buildMockResult(), _degraded: true, _error: String(detail) };
      } else {
        // 精细化上游错误透传
        if (status === 401) {
          return res.status(401).json({ error: 'API密钥无效或缺失', code: 'AUTHENTICATION_ERROR' });
        }
        if (status === 400) {
          return res.status(400).json({ error: `上游参数错误: ${String(detail)}`, code: 'UPSTREAM_BAD_REQUEST' });
        }
        return res.status(502).json({ error: `上游服务错误: ${String(detail)}`, code: 'UPSTREAM_ERROR' });
      }
    }
    
    res.json({
      task_id: String(startTs),
      result: result,
      latency_ms: Date.now() - startTs
    });

  } catch (error) {
    console.error('分析过程中发生错误:', error);
    
    // 根据错误类型返回不同的状态码
    if (error.message.includes('INSUFFICIENT_IMAGES') || error.message.includes('TOO_MANY_IMAGES')) {
      res.status(400).json({ error: error.message });
    } else if (error.response && error.response.status === 401) {
      res.status(401).json({
        error: 'API密钥无效或缺失',
        code: 'AUTHENTICATION_ERROR'
      });
    } else if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
      res.status(408).json({
        error: '请求超时，请稍后重试',
        code: 'TIMEOUT_ERROR'
      });
    } else {
      const detail = error?.response?.data?.error || error.message || 'internal error';
      res.status(500).json({
        error: `服务器内部错误：${String(detail)}`,
        code: 'INTERNAL_ERROR'
      });
    }
  }
});

// 事件上报（埋点）
app.post('/api/track', (req, res) => {
  try {
    const payload = req.body;
    if (!payload || typeof payload !== 'object') {
      return res.status(400).json({ error: 'invalid payload' });
    }
    // 允许批量或者单条
    const items = Array.isArray(payload) ? payload : [payload];
    for (const ev of items) {
      if (!ev.type) continue;
      // 补充服务器时间戳
      ev.server_ts = Date.now();
      eventStore.appendEvent(ev);
    }
    res.json({ ok: true, count: items.length });
  } catch (e) {
    console.error('track error', e);
    res.status(500).json({ error: 'track failed' });
  }
});

// 管理端指标接口
app.get('/admin/metrics/overview', (req, res) => {
  const { from, to } = req.query;
  const data = eventStore.overview({ from, to });
  res.json(data);
});

app.get('/admin/metrics/trends', (req, res) => {
  const { metric = 'pv', from, to, interval = 'day' } = req.query;
  const data = eventStore.trends({ metric, from, to, interval });
  res.json(data);
});

app.get('/admin/metrics/funnel', (req, res) => {
  const { from, to } = req.query;
  const data = eventStore.funnel({ from, to });
  res.json(data);
});

app.get('/admin/metrics/grouped', (req, res) => {
  const { group_by = 'channel', from, to } = req.query;
  const data = eventStore.grouped({ group_by, from, to });
  res.json(data);
});

app.get('/admin/events', (req, res) => {
  const { from, to } = req.query;
  const data = eventStore.queryEvents({ from, to });
  res.json({ total: data.length, items: data.slice(-500) });
});

// 简易导出（JSONL）
app.get('/admin/export', (req, res) => {
  const { from, to } = req.query;
  const data = eventStore.queryEvents({ from, to });
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="events.jsonl"');
  for (const ev of data) {
    res.write(JSON.stringify(ev) + '\n');
  }
  res.end();
});

// 构造本地联调用的模拟结果
function buildMockResult() {
  return {
    persona: {
      summary: "偏理性，重视实用体验与家庭通勤",
      traits: ["理性", "注重性价比", "务实"],
      communication_tone: "简洁直接，数据和场景结合"
    },
    interests: ["亲子出行", "周末郊游", "科技数码"],
    budget_signals: {
      sensitivity: "关注油耗与保值，接受智能化增值",
      range_hint: "15-20万（推测）",
      brand_attitude: "偏合资与新势力对比"
    },
    stage_judgement: "对比阶段",
    risks_and_taboo: ["避免贬低竞品", "避免过度夸大智能驾驶"],
    recommended_models: [
      {
        model_name: "紧凑型SUV-A",
        key_selling_points: ["空间", "油耗", "智能辅助"],
        why: "兼顾家庭出行与城市通勤，配置均衡"
      },
      {
        model_name: "混动轿车-B",
        key_selling_points: ["节能", "舒适性", "保值"],
        why: "重视经济性与二手保值，通勤友好"
      }
    ],
    talk_track: {
      opening_line: "看您近期亲子出行的照片，周末会有郊游或跨城计划吗？",
      value_narrative: "从家庭通勤与周末出行的真实场景出发，兼顾空间、安全与油耗，用更贴近生活的配置组合解决日常痛点。",
      follow_up_rhythm: "本周给对比清单，3天后反馈试驾感受，1周内敲定方案"
    },
    next_actions: ["发送两款对比清单", "预约周末试驾", "提供金融与置换方案"]
  };
}

// 调用Doubao API的函数
async function callDoubaoAPI(imageUrls) {
  try {
    // 注意：在实际部署时，API密钥应该存储在环境变量中，不能暴露给前端
    const apiKey = process.env.ARK_API_KEY;
    
    if (!apiKey) {
      throw new Error('API密钥未配置');
    }

    // 构建请求体
    const requestBody = {
      model: "doubao-seed-1-8-251228",
      input: [
        {
          role: "system",
          content: [
            {
              type: "text",
              text: "你是一个汽车销售冠军，对于年轻人，中年人，老年人的心理和外在表现，有非常强的洞察，也有一套很厉害的销售技巧的技巧！擅长于输出简短但有效的分析和建议"
            }
          ]
        },
        {
          role: "user",
          content: []
        }
      ]
    };

    // 添加图片URL到请求体
    imageUrls.forEach(url => {
      requestBody.input[1].content.push({
        type: "input_image",
        image_url: url
      });
    });

    // 添加文本提示
    requestBody.input[1].content.push({
      type: "input_text",
      text: "你是一个汽车销售冠军，对于年轻人，中年人，老年人的心理和外在表现，有非常强的洞察，也有一套很厉害的销售技巧的技巧！擅长于输出简短但有效的分析和建议。请你仅基于以下朋友圈截图，提取此人的人物画像与兴趣线索，并给出用于汽车销售的沟通策略。只做基于图片可见信息的合理推测，避免杜撰隐私。输出为简洁中文，遵循下列 JSON 字段：persona、interests、budget_signals、stage_judgement、risks_and_taboo、recommended_models、talk_track、next_actions。"
    });

    // 发送请求到Doubao API
    const response = await axios.post(
      'https://ark.cn-beijing.volces.com/api/v3/responses',
      requestBody,
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 60000 // 60秒超时
      }
    );

    // 返回上游原始数据，由上层做结构化归一
    return response.data;
  } catch (error) {
    console.error('调用Doubao API时发生错误:', error);
    throw error;
  }
}

// 将上游响应归一为前端需要的结构
function normalizeModelOutput(apiData) {
  try {
    // 取出文本内容
    let contentText = '';
    const msgContent = apiData?.output?.choices?.[0]?.message?.content;
    if (Array.isArray(msgContent)) {
      contentText = msgContent
        .filter(part => part?.type && String(part.type).includes('text'))
        .map(part => part.text || '')
        .join('\n');
    } else if (typeof msgContent === 'string') {
      contentText = msgContent;
    }

    // 尝试解析JSON
    let parsed;
    try {
      parsed = JSON.parse(contentText);
    } catch (_) {
      // 粗略从 ```json ... ``` 中提取
      const match = contentText.match(/```json([\s\S]*?)```/i) || contentText.match(/```([\s\S]*?)```/i);
      if (match && match[1]) {
        parsed = JSON.parse(match[1]);
      }
    }

    // 如果成功解析且包含预期字段，直接返回
    if (parsed && typeof parsed === 'object' && (
      parsed.persona || parsed.interests || parsed.budget_signals
    )) {
      return parsed;
    }

    // 兜底：把大段文本映射到人物画像摘要，避免前端崩溃
    return {
      persona: {
        summary: contentText || '模型返回为空',
        traits: [],
        communication_tone: ''
      },
      interests: [],
      budget_signals: {
        sensitivity: '',
        range_hint: '',
        brand_attitude: ''
      },
      stage_judgement: '',
      risks_and_taboo: [],
      recommended_models: [],
      talk_track: {
        opening_line: '',
        value_narrative: '',
        follow_up_rhythm: ''
      },
      next_actions: []
    };
  } catch (e) {
    console.error('normalizeModelOutput 解析失败:', e);
    // 最终兜底
    return buildMockResult();
  }
}

// 根路径健康检查
app.get('/', (req, res) => {
  res.json({ message: 'Car Sales Analysis Backend is running!' });
});

// 错误处理中间件
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        error: '文件大小超出限制（最大10MB）',
        code: 'FILE_TOO_LARGE'
      });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        error: '文件数量超出限制',
        code: 'TOO_MANY_FILES'
      });
    }
  }
  
  res.status(500).json({
    error: error.message || '服务器内部错误',
    code: 'INTERNAL_ERROR'
  });
});

// 404处理
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'API端点不存在',
    code: 'NOT_FOUND'
  });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
