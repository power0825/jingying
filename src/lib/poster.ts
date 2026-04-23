/**
 * 营销海报 - AI 文案生成 + 数据准备
 */
import { DashScope } from './qwen';

export interface PosterActivity {
  name: string;
  description: string; // AI 生成的行程描述，50-100字，类似 PDF 风格的正式介绍
  imageUrl?: string;
  type: 'visit' | 'teach';
  timeLabel: string; // 'AM' / 'PM'
}

export interface PosterDayData {
  day: number;
  morning: PosterActivity[];
  afternoon: PosterActivity[];
}

export interface PosterServiceInfo {
  name: string;
  type: 'hotel' | 'restaurant';
  description: string;
  imageUrl?: string;
}

export interface PosterData {
  projectName: string;
  clientName: string;
  participants: number;
  days: number;
  slogan: string;
  highlights: string[]; // AI 生成的行程亮点（3-4 条）
  daysData: PosterDayData[];
  hotelInfo?: PosterServiceInfo;
  restaurants: PosterServiceInfo[];
}

// 用 AI 生成海报全部文案
export async function generatePosterCopy(
  schedule: any[],
  suppliers: any[],
  hotelArrangement: any,
  projectName: string,
  clientName: string,
  participants: number,
  days: number
): Promise<PosterData> {
  const ai = new DashScope();

  // 构建行程文本（含所有供应商详情）
  const hotelSupplier = suppliers.find((s: any) => s.id === hotelArrangement?.hotelId);
  const hotelContext = hotelSupplier
    ? `酒店：${hotelSupplier.name}（${hotelArrangement.nights}晚，每间${hotelArrangement.peoplePerRoom}人）`
    : '酒店：未指定';

  // 收集所有餐厅
  const restaurantSet = new Set<string>();
  const restaurantIds: string[] = [];
  schedule.forEach((day: any) => {
    [day.noon, day.evening].forEach((meal: any) => {
      if (meal?.supplierId && !restaurantSet.has(meal.supplierId)) {
        restaurantSet.add(meal.supplierId);
        restaurantIds.push(meal.supplierId);
      }
    });
  });
  const restaurantContext = restaurantIds
    .map((id) => {
      const r = suppliers.find((s: any) => s.id === id);
      return r?.name || '未指定';
    })
    .join('、') || '未安排';

  // 构建每日详细行程
  const scheduleDetail = schedule.map((day: any) => {
    const morningActs = (day.morning || []).map((act: any) => {
      const supplier = suppliers.find((s: any) => s.id === act.supplierId);
      const name = supplier?.name || '未指定';
      if (act.type === 'visit') {
        return `参访：${name}`;
      }
      return `课程：${name} - ${act.courseName || '未指定'}（${act.hours || 0}课时）`;
    }).join('；') || '休息';

    const afternoonActs = (day.afternoon || []).map((act: any) => {
      const supplier = suppliers.find((s: any) => s.id === act.supplierId);
      const name = supplier?.name || '未指定';
      if (act.type === 'visit') {
        return `参访：${name}`;
      }
      return `课程：${name} - ${act.courseName || '未指定'}（${act.hours || 0}课时）`;
    }).join('；') || '休息';

    return `第${day.day}天\n  上午：${morningActs}\n  下午：${afternoonActs}`;
  }).join('\n\n');

  // 所有参访点 + 课程（用于 AI 生成亮点和描述）
  const allActivities: { name: string; type: string; description?: string; image_url?: string }[] = [];
  schedule.forEach((day: any) => {
    [...day.morning, ...day.afternoon].forEach((act: any) => {
      const supplier = suppliers.find((s: any) => s.id === act.supplierId);
      if (supplier) {
        allActivities.push({
          name: supplier.name,
          type: act.type,
          image_url: supplier.image_url,
        });
      }
    });
  });

  const prompt = `你是一个专业的游学/培训项目营销文案策划师。根据以下行程信息，为营销海报生成文案。

项目名称：${projectName}
客户名称：${clientName}
参访人数：${participants}人
天数：${days}天

酒店安排：${hotelContext}
餐饮安排：${restaurantContext}

详细行程：
${scheduleDetail}

请严格按以下JSON格式输出（不要包含markdown代码块标记）：
{
  "slogan": "一句有冲击力的营销标语，15字以内",
  "highlights": [
    "亮点1：30字以内，概括行程核心价值",
    "亮点2：30字以内",
    "亮点3：30字以内",
    "亮点4：30字以内"
  ],
  "days": [
    {
      "day": 1,
      "morning": [
        {
          "name": "供应商名称",
          "description": "50-100字的正式行程描述，类似旅游方案介绍。要介绍这个地方/课程的特色、亮点和参访价值，语言生动专业有吸引力"
        }
      ],
      "afternoon": [
        {
          "name": "供应商名称",
          "description": "50-100字的正式行程描述"
        }
      ]
    }
  ],
  "hotelDescription": "20-40字的酒店介绍，突出舒适度和特色",
  "restaurantDescriptions": [
    {"name": "餐厅名称", "description": "15-30字的餐厅介绍"}
  ]
}

要求：
1. slogan 要有冲击力和吸引力，适合做海报主标语
2. highlights 概括整个行程的核心亮点（如知名企业参访、专业课程、文化体验等），每条不超过30字
3. 每个活动的 description 写50-100字，像 PDF 方案那样正式介绍这个行程点的特色和价值
4. name 字段必须和行程中的供应商名称完全一致
5. 每天都要有 morning 和 afternoon，即使当天没安排也要保留空数组
6. restaurantDescriptions 中的 name 必须和上面列出的餐厅名称一致`;

  try {
    const response = await ai.call({
      model: 'qwen-plus',
      messages: [
        {
          role: 'system',
          content: '你是专业的营销文案策划师。请直接输出JSON，不要输出其他内容。',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const text = response.output?.text || '';
    console.log('[Poster AI] 原始回复:', text);

    let parsed: any;
    try {
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[1] : text);
    } catch {
      console.warn('[Poster AI] 解析失败，使用默认文案');
      parsed = generateFallbackCopy(schedule, suppliers, projectName, clientName, hotelArrangement, hotelSupplier);
    }

    // 构建海报数据 - 每日行程
    const daysData: PosterDayData[] = (parsed.days || []).map((dayData: any) => {
      const scheduleDay = schedule.find((s: any) => s.day === dayData.day);
      const morning: PosterActivity[] = (dayData.morning || []).map((a: any, i: number) => {
        const scheduleMorning = scheduleDay?.morning?.[i];
        const supplier = suppliers.find((s: any) => s.name === a.name);
        return {
          name: a.name,
          description: a.description,
          imageUrl: supplier?.image_url,
          type: scheduleMorning?.type || 'visit',
          timeLabel: 'AM',
        };
      });
      const afternoon: PosterActivity[] = (dayData.afternoon || []).map((a: any, i: number) => {
        const scheduleAfternoon = scheduleDay?.afternoon?.[i];
        const supplier = suppliers.find((s: any) => s.name === a.name);
        return {
          name: a.name,
          description: a.description,
          imageUrl: supplier?.image_url,
          type: scheduleAfternoon?.type || 'visit',
          timeLabel: 'PM',
        };
      });
      return { day: dayData.day, morning, afternoon };
    });

    // 酒店信息
    const hotelInfo: PosterServiceInfo | undefined = hotelSupplier
      ? {
          name: hotelSupplier.name,
          type: 'hotel',
          description: parsed.hotelDescription || `${hotelSupplier.name}，舒适入住${hotelArrangement.nights}晚`,
          imageUrl: hotelSupplier.image_url,
        }
      : undefined;

    // 餐厅信息
    const restaurants: PosterServiceInfo[] = (parsed.restaurantDescriptions || []).map((r: any) => {
      const supplier = suppliers.find((s: any) => s.name === r.name);
      return {
        name: r.name,
        type: 'restaurant',
        description: r.description,
        imageUrl: supplier?.image_url,
      };
    });

    return {
      projectName,
      clientName,
      participants,
      days,
      slogan: parsed.slogan || `${projectName} · ${clientName}`,
      highlights: parsed.highlights || [],
      daysData,
      hotelInfo,
      restaurants,
    };
  } catch (error) {
    console.error('[Poster AI] 生成失败:', error);
    const fallback = generateFallbackCopy(schedule, suppliers, projectName, clientName, hotelArrangement, hotelSupplier);
    return {
      projectName,
      clientName,
      participants,
      days,
      slogan: fallback.slogan,
      highlights: fallback.highlights,
      daysData: fallback.days,
      hotelInfo: fallback.hotelInfo,
      restaurants: fallback.restaurants,
    };
  }
}

// 降级方案
function generateFallbackCopy(
  schedule: any[],
  suppliers: any[],
  projectName: string,
  clientName: string,
  hotelArrangement: any,
  hotelSupplier: any
) {
  const days = schedule.map((day: any) => {
    const morning = (day.morning || []).map((act: any, i: number) => {
      const supplier = suppliers.find((s: any) => s.id === act.supplierId);
      return {
        name: supplier?.name || '参访点',
        description: act.type === 'visit' ? '走进行业领军企业，近距离感受创新文化和管理模式，深入了解企业发展历程与核心业务。' : `专业课程：${act.courseName || '未指定'}，系统学习实用知识，提升实战能力。`,
        imageUrl: supplier?.image_url,
        type: act.type,
        timeLabel: 'AM',
      };
    });
    const afternoon = (day.afternoon || []).map((act: any) => {
      const supplier = suppliers.find((s: any) => s.id === act.supplierId);
      return {
        name: supplier?.name || '参访点',
        description: act.type === 'visit' ? '走进行业领军企业，近距离感受创新文化和管理模式，深入了解企业发展历程与核心业务。' : `专业课程：${act.courseName || '未指定'}，系统学习实用知识，提升实战能力。`,
        imageUrl: supplier?.image_url,
        type: act.type,
        timeLabel: 'PM',
      };
    });
    return { day: day.day, morning, afternoon };
  });

  // 收集餐厅
  const restaurantSet = new Set<string>();
  const restaurants: any[] = [];
  schedule.forEach((day: any) => {
    [day.noon, day.evening].forEach((meal: any) => {
      if (meal?.supplierId && !restaurantSet.has(meal.supplierId)) {
        restaurantSet.add(meal.supplierId);
        const r = suppliers.find((s: any) => s.id === meal.supplierId);
        if (r) {
          restaurants.push({
            name: r.name,
            type: 'restaurant',
            description: `精选当地特色餐饮，品味地道风味。`,
            imageUrl: r.image_url,
          });
        }
      }
    });
  });

  const hotelInfo = hotelSupplier
    ? {
        name: hotelSupplier.name,
        type: 'hotel',
        description: `舒适入住${hotelArrangement.nights}晚，享受优质住宿体验。`,
        imageUrl: hotelSupplier.image_url,
      }
    : undefined;

  return {
    slogan: `${projectName} · ${clientName}参访之旅`,
    highlights: ['精选优质参访点', '专业课程赋能', '全方位服务体验'],
    days,
    hotelInfo,
    restaurants,
  };
}
