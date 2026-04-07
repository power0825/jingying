/**
 * 阿里云百炼 DashScope SDK（通过 Vercel Serverless 代理）
 * API Key 由服务器端管理，不会暴露
 */

export class DashScope {
  private baseUrl = '/api/qwen';

  async call(options: {
    model: string;
    messages: Array<{ role: string; content: string }>;
  }) {
    console.log('[DashScope] 发送请求到:', this.baseUrl);
    console.log('[DashScope] 请求内容:', JSON.stringify(options, null, 2));

    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: options.model,
        messages: options.messages,
      }),
    });

    console.log('[DashScope] 响应状态:', response.status);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('[DashScope] 错误:', errorData);
      throw new Error(`DashScope API error: ${response.status} - ${JSON.stringify(errorData)}`);
    }

    const result = await response.json();
    console.log('[DashScope] 响应内容:', result);

    return {
      output: {
        text: result.choices?.[0]?.message?.content || '',
      },
    };
  }
}

const ai = new DashScope();

export async function askDataAssistant(question: string, context: any) {
  console.log('[AI Assistant] 开始处理问题:', question);
  console.log('[AI Assistant] 上下文数据:', context);

  try {
    const response = await ai.call({
      model: "qwen-plus",
      messages: [
        {
          role: "system",
          content: "你是一个专业的财务和项目管理 AI 助手。请根据用户提供的数据回答问题。"
        },
        {
          role: "user",
          content: `以下是当前系统的实时数据摘要：

${JSON.stringify(context, null, 2)}

请根据以上数据回答用户的问题。如果数据中没有相关信息，请礼貌地告知用户。
用户问题：${question}`
        }
      ]
    });

    console.log('[AI Assistant] 回答:', response.output?.text);
    return response.output?.text || "抱歉，我无法生成回答。";
  } catch (error) {
    console.error("[AI Assistant Error]:", error);
    return "AI 助手暂时无法响应，请稍后再试。";
  }
}
