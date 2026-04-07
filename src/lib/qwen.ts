/**
 * 阿里云百炼 DashScope SDK（简化版）
 * 使用原生 fetch 调用 Qwen API
 */

export interface DashScopeConfig {
  apiKey: string;
}

export class DashScope {
  private apiKey: string;
  private baseUrl = 'https://dashscope.aliyuncs.com/compatible-mode/v1';

  constructor(config: DashScopeConfig) {
    this.apiKey = config.apiKey;
  }

  async call(options: {
    model: string;
    input: {
      messages: Array<{ role: string; content: string }>;
    };
  }) {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: options.model,
        messages: options.input.messages,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`DashScope API error: ${response.status} - ${JSON.stringify(errorData)}`);
    }

    const result = await response.json();
    return {
      output: {
        text: result.choices?.[0]?.message?.content || '',
      },
    };
  }
}

const ai = new DashScope({ apiKey: (import.meta as any).env.VITE_DASHSCOPE_API_KEY || '' });

export async function askDataAssistant(question: string, context: any) {
  try {
    const response = await ai.call({
      model: "qwen3.5-plus",
      input: {
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
      }
    });

    return response.output?.text || "抱歉，我无法生成回答。";
  } catch (error) {
    console.error("AI Assistant Error:", error);
    return "AI 助手暂时无法响应，请稍后再试。";
  }
}
