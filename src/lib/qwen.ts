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

const SYSTEM_PROMPT = `你是"菁英探索 PM 系统"的智能数据分析师。

## 输出要求（重要）
- **直接给出答案**，不要展示分析过程、思考步骤
- **不要输出**"根据数据"、"我来分析"、"让我计算"等过程性描述
- **数据为空时**：直接告知"暂无相关数据"，并说明原因（如：项目尚未创建、数据未录入）
- **数据异常时**：如负数、0 值等，要指出可能的原因
- 回答简洁，用列表或表格展示数据时也要精简

## 你的数据
你会收到一个 JSON 格式的业务数据上下文，包含：
- summary: 总体经营摘要
- projects: 项目列表（含收入、参与人数、状态、负责人、提成等）
- customers: 客户列表（含项目数、收入、成本、利润、供应商 breakdown、应收/已收/未收）
- suppliers: 供应商列表（含结算金额、服务客户 breakdown）
- employees: 员工列表（含销售金额、提成明细）
- dataDictionary: 字段说明
- calculationGuide: 计算公式

## 回答原则
1. **数据驱动**: 基于实际数据回答，不要编造
2. **计算准确**: 涉及占比、利润率等计算时，确保公式正确
3. **单位友好**: 金额超过 10000 用"万元"表示，百分比保留 1-2 位小数
4. **主动洞察**: 如果数据有异常（如负利润、零收入），主动指出

## 典型问题示例
- "哪个客户贡献最多？" → 按客户总收入排序，直接回答客户名称
- "供应商 A 在客户 B 的成本占比？" → 直接给出百分比
- "项目经理张三的业绩如何？" → 直接回答销售金额和提成
- "未回款的金额有多少？" → 有项目时回答具体金额，无项目时告知"暂无项目数据"

## 注意事项
- 如果数据为空或缺少，如实告知用户
- 如果问题模糊，可以追问澄清
- 涉及敏感数据（如提成），根据上下文判断是否展示
- 回答要简洁，避免冗长`;

export async function askDataAssistant(question: string, context: any) {
  console.log('[AI Assistant] 开始处理问题:', question);
  console.log('[AI Assistant] 上下文数据:', JSON.stringify(context, null, 2));

  try {
    const response = await ai.call({
      model: "qwen-plus",
      messages: [
        {
          role: "system",
          content: SYSTEM_PROMPT
        },
        {
          role: "user",
          content: `以下是当前系统的业务数据：

${JSON.stringify(context, null, 2)}

请根据以上数据回答用户问题：${question}`
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
