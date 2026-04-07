import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 只允许 POST 请求
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.QWEN_VL_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API Key not configured' });
  }

  const { action, model, input, messages, parameters, ...body } = req.body;

  try {
    // 发票识别使用不同的 endpoint
    const isInvoice = action === 'invoice';
    const endpoint = isInvoice
      ? 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation'
      : 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';

    // 构建请求体
    const requestBody = isInvoice
      ? {
          model,
          input: input || { messages },
          parameters: parameters || {},
        }
      : {
          model,
          messages,
          ...body,
        };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'X-DashScope-SSE': 'disable',
      },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error: any) {
    console.error('Qwen API Error:', error);
    res.status(500).json({ error: 'Failed to call Qwen API', message: error.message });
  }
}
