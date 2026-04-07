/**
 * 发票识别 API 配置
 * 使用阿里云 Qwen2.5-VL 模型进行发票 OCR 识别
 * 支持 PDF 文件（自动转图片处理）
 */

export interface InvoiceRecognitionConfig {
  /** API 端点 */
  apiEndpoint: string;
  /** 模型名称 */
  model: string;
}

/**
 * 发票识别配置
 * API Key 从环境变量读取
 * 请在阿里云百炼控制台获取 API Key: https://bailian.console.aliyun.com/
 */
export const INVOICE_RECOGNITION_CONFIG: InvoiceRecognitionConfig = {
  apiEndpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', // 直接调用阿里云 API
  model: 'qwen2.5-vl-plus', // Qwen2.5-VL 系列，性价比高
};

/**
 * 从环境变量获取 API Key
 */
function getApiKey(): string {
  const apiKey = (import.meta as any).env.VITE_QWEN_VL_API_KEY;
  if (!apiKey) {
    throw new Error('请先在 Vercel 环境变量中配置 VITE_QWEN_VL_API_KEY');
  }
  return apiKey;
}

/**
 * 调用阿里云 Qwen2.5-VL 模型识别发票号
 * @param imageUrl 发票图片或 PDF URL
 * @returns 识别到的发票号
 */
export async function recognizeInvoiceNumber(imageUrl: string): Promise<string> {
  const config = INVOICE_RECOGNITION_CONFIG;
  const apiKey = getApiKey();

  console.log('开始识别发票，URL:', imageUrl);
  console.log('API 端点:', config.apiEndpoint);

  // 使用 AbortController 设置 60 秒超时
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);

  try {
    const response = await fetch(config.apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: imageUrl,
              },
              {
                type: 'text',
                text: '请识别这张发票的发票号码。发票号通常是 8-20 位的数字或字母组合，位于发票的右上角或显著位置。请直接返回发票号码本身，不要包含任何其他文字、标点或说明。如果没有找到发票号码，请返回"未找到"。',
              },
            ],
          },
        ],
        max_tokens: 50,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    console.log('API 响应状态:', response.status);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('API Error:', errorData);
      if (response.status === 413) {
        throw new Error('图片文件过大，请上传更小的发票文件或图片');
      }
      throw new Error(`API 请求失败：${response.status} - ${JSON.stringify(errorData)}`);
    }

    const result = await response.json();
    console.log('Qwen API Response:', result);

    // 阿里云 DashScope 响应格式
    if (result.output && result.output.text) {
      const invoiceNumber = result.output.text.trim();
      // 清理可能的前缀/后缀和引号
      const cleaned = invoiceNumber
        .replace(/^(发票号 (码)？[：:]\s*|发票 [：:]\s*)/i, '')
        .replace(/^["']|["']$/g, '')
        .trim();

      if (cleaned === '未找到' || cleaned.length < 4) {
        throw new Error('未能识别到有效的发票号码');
      }

      console.log('识别到的发票号:', cleaned);
      return cleaned;
    }

    // 备用响应格式
    if (result.choices && result.choices[0] && result.choices[0].message) {
      const content = result.choices[0].message.content;
      const invoiceNumber = typeof content === 'string' ? content.trim() : '';
      const cleaned = invoiceNumber
        .replace(/^(发票号 (码)？[：:]\s*|发票 [：:]\s*)/i, '')
        .replace(/^["']|["']$/g, '')
        .trim();

      if (cleaned === '未找到' || cleaned.length < 4) {
        throw new Error('未能识别到有效的发票号码');
      }

      console.log('识别到的发票号:', cleaned);
      return cleaned;
    }

    throw new Error('无法解析 API 响应');
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('识别超时，请检查网络连接或稍后重试');
    }
    throw error;
  }
}

/**
 * 压缩图片
 * 将图片下载后压缩为 JPEG 格式
 */
async function compressImage(imageUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      // 计算缩放比例（最大宽度 1200px）
      const maxWidth = 1200;
      let width = img.width;
      let height = img.height;

      if (width > maxWidth) {
        height = (height * maxWidth) / width;
        width = maxWidth;
      }

      canvas.width = width;
      canvas.height = height;

      ctx?.drawImage(img, 0, 0, width, height);

      // 压缩为 JPEG，质量 0.7
      const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
      resolve(dataUrl);
    };
    img.onerror = () => {
      // 如果是 CORS 问题，直接使用原 URL
      console.log('无法压缩图片，可能由于 CORS 限制，将尝试直接使用原图');
      resolve(imageUrl);
    };
    img.src = imageUrl;
  });
}
