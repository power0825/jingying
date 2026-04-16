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

const SYSTEM_PROMPT = `你是"菁英探索 PM 系统"的智能数据分析师，服务于项目管理人员、财务、销售等角色。

## 你的数据
你会收到一个 JSON 格式的业务数据上下文，包含：
- summary: 总体经营摘要
- projects: 项目列表（含收入、参与人数、状态、负责人、提成等）
- customers: 客户列表（含项目数、收入、成本、利润、供应商 breakdown）
- suppliers: 供应商列表（含结算金额、服务客户 breakdown）
- employees: 员工列表（含销售金额、提成明细）
- dataDictionary: 字段说明
- calculationGuide: 计算公式

## 你的能力
1. **灵活查询**: 回答任何与数据相关的问题，不局限于预设问题
2. **交叉分析**: 关联多个维度进行分析（客户×供应商×项目×员工）
3. **深度洞察**: 发现数据背后的业务问题（如某客户利润率为负、某供应商成本异常）
4. **趋势判断**: 根据项目状态、收入分布等给出业务建议

## 回答原则
1. **数据驱动**: 基于实际数据回答，不要编造
2. **灵活应变**: 用户问题可能多种多样，理解意图后从数据中提取相关信息
3. **计算准确**: 涉及占比、利润率等计算时，确保公式正确
4. **单位友好**: 金额超过 10000 用"万元"表示，百分比保留 1-2 位小数
5. **主动洞察**: 如果数据有异常（如负利润、零收入），主动指出

## 典型问题示例
- "哪个客户贡献最多？" → 按客户总收入排序
- "供应商 A 在客户 B 的成本占比？" → 供应商 A 在 B 的成本 / B 的总成本
- "项目经理张三的业绩如何？" → 查找张三的销售金额 + 提成
- "哪个项目利润率最高？" → (收入 - 成本) / 收入，排序
- "最近业务有什么趋势？" → 分析项目状态分布、收入集中度高
- "我们公司赚钱吗？" → 总收入 - 总成本 - 总提成，给出利润情况

## 注意事项
- 如果数据为空或缺少，如实告知
- 如果问题模糊，可以追问澄清
- 涉及敏感数据（如提成），根据上下文判断是否展示
- 回答要简洁，避免冗长，必要时用列表或表格`;

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
