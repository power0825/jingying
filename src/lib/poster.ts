/**
 * 营销海报 - AI 文案生成 + 数据准备
 */
import { DashScope } from './qwen';

export interface PosterDayHighlight {
  name: string; // 地点/活动名称
  description: string; // AI 生成的亮点描述
  imageUrl?: string;
  type: 'visit' | 'teach' | 'meal';
}

export interface PosterDayData {
  day: number;
  morningHighlights: PosterDayHighlight[];
  afternoonHighlights: PosterDayHighlight[];
}

export interface PosterData {
  projectName: string;
  clientName: string;
  participants: number;
  days: number;
  daysData: PosterDayData[];
  slogan: string;
}

// 用 AI 生成每日亮点描述
export async function generatePosterCopy(
  schedule: any[],
  suppliers: any[],
  projectName: string,
  clientName: string,
  participants: number,
  days: number
): Promise<PosterData> {
  const ai = new DashScope();

  // 构建行程文本
  const scheduleText = schedule.map((day: any) => {
    const morningActs = (day.morning || []).map((act: any) => {
      const supplier = suppliers.find((s: any) => s.id === act.supplierId);
      const name = supplier?.name || '未指定';
      if (act.type === 'visit') return `${name}（参访）`;
      return `${name}（${act.courseName || '课程'}）`;
    }).join('、') || '休息';

    const afternoonActs = (day.afternoon || []).map((act: any) => {
      const supplier = suppliers.find((s: any) => s.id === act.supplierId);
      const name = supplier?.name || '未指定';
      if (act.type === 'visit') return `${name}（参访）`;
      return `${name}（${act.courseName || '课程'}）`;
    }).join('、') || '休息';

    return `第${day.day}天 上午：${morningActs}；下午：${afternoonActs}`;
  }).join('\n');

  const prompt = `你是一个专业的游学/培训项目营销文案策划师。根据以下行程信息，为营销海报生成吸引人的文案。

项目名称：${projectName}
客户名称：${clientName}
参访人数：${participants}人
天数：${days}天

行程：
${scheduleText}

请严格按以下JSON格式输出（不要包含markdown代码块标记）：
{
  "slogan": "一句有吸引力的营销标语，15字以内",
  "days": [
    {
      "day": 1,
      "morningHighlights": [
        {"name": "供应商名称", "description": "20字以内的亮点描述，要生动有吸引力"}
      ],
      "afternoonHighlights": [
        {"name": "供应商名称", "description": "20字以内的亮点描述"}
      ]
    }
  ]
}

要求：
1. slogan要有冲击力和吸引力
2. 每个亮点描述不超过20字
3. name字段必须和行程中的供应商名称完全一致
4. 每天都要有 morningHighlights 和 afternoonHighlights，即使当天没有安排也要保留空数组`;

  try {
    const response = await ai.call({
      model: 'qwen-plus',
      messages: [
        {
          role: 'system',
          content: '你是专业的营销文案策划师。请直接输出JSON，不要输出其他内容。'
        },
        {
          role: 'user',
          content: prompt
        }
      ]
    });

    const text = response.output?.text || '';
    console.log('[Poster AI] 原始回复:', text);

    // 解析 AI 回复
    let parsed: any;
    try {
      // 尝试从 markdown 代码块中提取 JSON
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[1] : text);
    } catch {
      // 如果解析失败，使用默认文案
      console.warn('[Poster AI] 解析失败，使用默认文案');
      parsed = generateFallbackCopy(schedule, suppliers, projectName, clientName);
    }

    // 构建海报数据
    const daysData: PosterDayData[] = (parsed.days || []).map((dayData: any) => {
      const scheduleDay = schedule.find((s: any) => s.day === dayData.day);
      return {
        day: dayData.day,
        morningHighlights: (dayData.morningHighlights || []).map((h: any) => {
          const supplier = suppliers.find((s: any) => s.name === h.name);
          return {
            name: h.name,
            description: h.description,
            imageUrl: supplier?.image_url,
            type: scheduleDay?.morning?.[0]?.type || 'visit',
          };
        }),
        afternoonHighlights: (dayData.afternoonHighlights || []).map((h: any) => {
          const supplier = suppliers.find((s: any) => s.name === h.name);
          return {
            name: h.name,
            description: h.description,
            imageUrl: supplier?.image_url,
            type: scheduleDay?.afternoon?.[0]?.type || 'visit',
          };
        }),
      };
    });

    return {
      projectName,
      clientName,
      participants,
      days,
      daysData,
      slogan: parsed.slogan || `${projectName} · ${clientName}`,
    };
  } catch (error) {
    console.error('[Poster AI] 生成失败:', error);
    // 降级：使用默认文案
    const fallback = generateFallbackCopy(schedule, suppliers, projectName, clientName);
    return {
      projectName,
      clientName,
      participants,
      days,
      daysData: fallback.days,
      slogan: fallback.slogan,
    };
  }
}

// 降级方案：不使用 AI，直接生成基础文案
function generateFallbackCopy(
  schedule: any[],
  suppliers: any[],
  projectName: string,
  clientName: string
) {
  const days = schedule.map((day: any) => {
    const morningHighlights = (day.morning || []).map((act: any) => {
      const supplier = suppliers.find((s: any) => s.id === act.supplierId);
      return {
        name: supplier?.name || '参访点',
        description: act.type === 'visit' ? '深入企业，感受创新' : '专业课程，实战学习',
        imageUrl: supplier?.image_url,
        type: act.type,
      };
    });

    const afternoonHighlights = (day.afternoon || []).map((act: any) => {
      const supplier = suppliers.find((s: any) => s.id === act.supplierId);
      return {
        name: supplier?.name || '参访点',
        description: act.type === 'visit' ? '深入企业，感受创新' : '专业课程，实战学习',
        imageUrl: supplier?.image_url,
        type: act.type,
      };
    });

    return { day: day.day, morningHighlights, afternoonHighlights };
  });

  return {
    slogan: `${projectName} · ${clientName}参访之旅`,
    days,
  };
}
