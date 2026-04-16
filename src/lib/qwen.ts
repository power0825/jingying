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

const SYSTEM_PROMPT = `你是一个专业的财务和项目管理 AI 助手，服务于"菁英探索 PM 系统"。

## 数据说明
你将收到以下格式的 JSON 数据：
- summary: 总体摘要（项目总数、客户总数、供应商总数、员工总数、总收入、总成本、总参与人数）
- projectStatus: 项目状态分布（如 {"已归档": 3, "已通过": 1, "执行中": 11}）
- projects: 项目列表（包含 id、code、name、customer_name、income_with_tax、participants、status、bd_manager_name、class_teacher_name）
- customers: 客户列表（包含 id、name、code、type、projectCount、totalRevenue）
- suppliers: 供应商列表（包含 id、name、type、totalCost、totalActual、projectCount）
- employees: 员工列表（包含 id、name、role）
- customerSupplierCost: 客户 - 供应商成本关联（用于计算某供应商在某客户项目中的成本占比）

## 能力要求
1. **数据查询**: 可以回答关于项目、客户、供应商、员工的基本信息查询
2. **统计分析**: 可以进行汇总、占比、对比等分析
3. **交叉分析**: 可以回答跨维度的问题，如"供应商 A 的成本在客户 S 的所有成本里面的占比"
4. **趋势分析**: 根据项目状态、收入等数据进行分析

## 回答规范
1. 数据要准确，基于提供的 JSON 数据回答
2. 如果数据中没有相关信息，礼貌告知用户
3. 涉及金额时，可以使用"元"或"万元"为单位（超过 10000 元建议转换为万元）
4. 涉及百分比时，保留 1-2 位小数
5. 回答要简洁清晰，必要时可以用表格或列表形式

## 计算示例
- 供应商 A 在客户 S 的成本占比 = customerSupplierCost 中客户 S 下供应商 A 的成本 / 客户 S 下所有供应商成本之和
- 项目利润率 = (总收入 - 总成本) / 总收入 * 100%
- 客户贡献占比 = 某客户总收入 / 所有客户总收入之和 * 100%`;

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
