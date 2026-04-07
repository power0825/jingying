import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Calculator, Loader2, FileText, Save, Download, Edit3, Check, Plus, Trash2, History } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { supabase } from '../lib/supabase';
import { DashScope, askDataAssistant } from '../lib/qwen';
import Markdown from 'react-markdown';
import html2pdf from 'html2pdf.js';
import { useAppStore } from '../store';

const quotationSchema = z.object({
  projectName: z.string().min(1, '请输入项目名称'),
  clientName: z.string().min(1, '请输入客户名称'),
  clientId: z.string().min(1, '请选择客户，或者先在"客户管理"录入客户信息'),
  participants: z.coerce.number().min(1, '请输入参访人数'),
  days: z.coerce.number().min(1, '请输入参访天数'),
  maxBudget: z.coerce.number().min(0, '请输入最高预算'),
  quotedPricePerPerson: z.coerce.number().optional(),
  quotedTotalPrice: z.coerce.number().optional(),
  quotationNumber: z.string().min(1, '请输入报价单号'),
});

type QuotationFormData = z.infer<typeof quotationSchema>;

interface Activity {
  id: string;
  type: 'visit' | 'teach';
  supplierId: string;
  courseName?: string;
  language?: string;
  hours?: number;
  billingType?: 'hour' | 'half_day' | 'day';
  venueId?: string;
  venueBillingType?: 'hour' | 'half_day' | 'day';
  venueHours?: number;
  venueCost?: number; // 场地预算成本
  venueActualCost?: number; // 场地实际成本
  cost: number; // 活动预算成本
  actualCost?: number; // 活动实际成本
}

interface Meal {
  supplierId: string;
  cost: number; // 餐饮预算成本
  actualCost?: number; // 餐饮实际成本
}

interface DailySchedule {
  day: number;
  morning: Activity[];
  noon: Meal;
  afternoon: Activity[];
  evening: Meal;
  busId: string;
  busDuration?: 'hour' | 'half' | 'full' | 'none';
  busHours?: number;
  busCost: number; // 大巴预算成本
  busActualCost?: number; // 大巴实际成本
}

interface HotelArrangement {
  hotelId: string;
  nights: number;
  peoplePerRoom: number;
  cost: number; // 酒店预算成本
  actualCost?: number; // 酒店实际成本
}

export default function Quotations() {
  const { user } = useAppStore();
  const navigate = useNavigate();
  const isAccountManager = user?.role === '客户经理';
  const isOperationManager = user?.role === '运营经理';
  const [activeTab, setActiveTab] = useState<'manual' | 'history' | 'prompt'>('manual');

  // --- Prompt Configuration State ---
  const [promptTemplate, setPromptTemplate] = useState('');
  const [loadingPrompt, setLoadingPrompt] = useState(false);
  const [savingPrompt, setSavingPrompt] = useState(false);

  // --- History State ---
  const [historyQuotations, setHistoryQuotations] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [currentQuotationId, setCurrentQuotationId] = useState<string | null>(null);
  const [clients, setClients] = useState<any[]>([]);

  const {
    register,
    handleSubmit,
    getValues,
    watch,
    setValue,
    formState: { errors },
  } = useForm<QuotationFormData>({
    resolver: zodResolver(quotationSchema) as any,
    defaultValues: {
      participants: 20,
      days: 3,
      maxBudget: 100000,
      quotationNumber: `Q${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}${String(new Date().getDate()).padStart(2, '0')}-${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`,
    },
  });

  const fetchHistory = async () => {
    if (!user) return;
    setLoadingHistory(true);
    try {
      const isCustomerDirector = user.role === '客户总监';
      const isOperationDirector = user.role === '运营总监';
      let query = supabase.from('quotations').select('*');

      if (isAccountManager || isOperationManager) {
        // 客户经理和运营经理只能查看自己生成的报价单
        query = query.eq('created_by', user.id);
      } else if (!isCustomerDirector && !isOperationDirector) {
        // 客户总监和运营总监可以查看所有报价单
        // 其他角色可以查看自己和下属生成的报价单
        const { data: usersData, error: usersError } = await supabase.from('users').select('*');
        if (usersError) throw usersError;

        const subordinates = usersData.filter(u => u.manager_id === user.id).map(u => u.id);
        const allowedUserIds = [user.id, ...subordinates];
        query = query.in('created_by', allowedUserIds);
      }

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) throw error;
      setHistoryQuotations(data || []);
    } catch (err) {
      console.error('Error fetching history:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'history') {
      fetchHistory();
    }
  }, [activeTab, user]);

  // --- Prompt Configuration ---
  const fetchPromptTemplate = async () => {
    try {
      setLoadingPrompt(true);
      const { data, error } = await supabase
        .from('prompt_templates')
        .select('template_content')
        .eq('type', 'quotation_proposal')
        .single();

      if (error && error.code !== 'PGRST116') throw error;

      if (data?.template_content) {
        setPromptTemplate(data.template_content);
      } else {
        // Default template
        setPromptTemplate(`你是一个专业的游学/培训项目产品经理。请根据以下客户需求和我们已经人工配置好的行程安排，自动生成一份给客户的正式项目方案。

【客户需求】
- 项目名称：{projectName}
- 客户名称：{clientName}
- 参访人数：{participants} 人
- 参访天数：{days} 天
- 报价信息：{quotedPriceInfo}

【已配置行程安排】
{hotelContext}

{scheduleContext}

【输出要求】
1. 方案概述：简述方案的整体思路和亮点。
2. 详细行程：将上述已配置的行程安排润色成适合发给客户看的详细行程描述。
3. 报价说明：请引用上述的报价信息（如果有单人报价和总价，请都列出），并说明这是一个高品质的定制方案，包含上述行程中的所有项目。请不要列出我们的成本价。

请使用 Markdown 格式输出，排版清晰美观，语言专业热情。`);
      }
    } catch (err) {
      console.error('Error fetching prompt template:', err);
    } finally {
      setLoadingPrompt(false);
    }
  };

  const savePromptTemplate = async () => {
    try {
      setSavingPrompt(true);
      const { error } = await supabase
        .from('prompt_templates')
        .upsert({
          type: 'quotation_proposal',
          template_content: promptTemplate,
          updated_at: new Date().toISOString(),
        });

      if (error) throw error;
      alert('提示词已保存');
    } catch (err) {
      console.error('Error saving prompt template:', err);
      alert('保存失败');
    } finally {
      setSavingPrompt(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'prompt') {
      fetchPromptTemplate();
    }
  }, [activeTab]);

  // --- Manual Quotation State ---
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [schedule, setSchedule] = useState<DailySchedule[]>([]);
  const [hotelArrangement, setHotelArrangement] = useState<HotelArrangement>({
    hotelId: '',
    nights: 0,
    peoplePerRoom: 2,
    cost: 0,
  });
  const [isGeneratingManual, setIsGeneratingManual] = useState(false);
  const [manualProposal, setManualProposal] = useState<string | null>(null);
  const [manualError, setManualError] = useState<string | null>(null);
  const [isEditingProposal, setIsEditingProposal] = useState(false);
  const [editableProposal, setEditableProposal] = useState('');

  // --- Quotation Number Generation ---
  const generateQuotationNumber = () => {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const randomStr = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `QT-${dateStr}-${randomStr}`;
  };

  // --- Draft Functionality ---
  useEffect(() => {
    const savedDraft = localStorage.getItem('quotation_draft');
    if (savedDraft) {
      try {
        const draft = JSON.parse(savedDraft);
        // Auto-restore without confirm to ensure persistence across menu navigation
        setValue('projectName', draft.projectName);
        setValue('clientName', draft.clientName);
        setValue('participants', draft.participants);
        setValue('days', draft.days);
        setValue('maxBudget', draft.maxBudget);
        setValue('quotedPricePerPerson', draft.quotedPricePerPerson);
        setValue('quotedTotalPrice', draft.quotedTotalPrice);
        setValue('quotationNumber', draft.quotationNumber || generateQuotationNumber());
        setSchedule(draft.schedule || []);
        setHotelArrangement(draft.hotelArrangement || { hotelId: '', nights: 0, peoplePerRoom: 2, cost: 0 });
      } catch (e) {
        console.error('Error loading draft:', e);
      }
    } else {
      setValue('quotationNumber', generateQuotationNumber());
    }
  }, []);

  const saveDraft = () => {
    const draft = {
      projectName: getValues('projectName'),
      clientName: getValues('clientName'),
      participants: getValues('participants'),
      days: getValues('days'),
      maxBudget: getValues('maxBudget'),
      quotedPricePerPerson: getValues('quotedPricePerPerson'),
      quotedTotalPrice: getValues('quotedTotalPrice'),
      quotationNumber: getValues('quotationNumber'),
      schedule,
      hotelArrangement
    };
    localStorage.setItem('quotation_draft', JSON.stringify(draft));
  };

  // Auto-save draft on changes
  useEffect(() => {
    const timer = setTimeout(() => {
      saveDraft();
    }, 1000);
    return () => clearTimeout(timer);
  }, [schedule, hotelArrangement, watch('projectName'), watch('clientName'), watch('participants'), watch('days'), watch('maxBudget'), watch('quotedPricePerPerson'), watch('quotedTotalPrice'), watch('quotationNumber')]);

  useEffect(() => {
    const fetchSuppliers = async () => {
      const { data } = await supabase.from('suppliers').select('*');
      if (data) setSuppliers(data);
    };
    const fetchClients = async () => {
      const { data } = await supabase.from('customers').select('*').order('name');
      if (data) setClients(data);
    };
    fetchSuppliers();
    fetchClients();
  }, []);

  const participants = watch('participants') || 0;
  const days = watch('days') || 0;
  const quotedPricePerPerson = watch('quotedPricePerPerson') || 0;
  const quotedTotalPrice = watch('quotedTotalPrice') || 0;

  const generateScheduleTable = async () => {
    // 修改模式下不允许重新生成行程表
    if (currentQuotationId) {
      alert('修改模式下无法重新生成行程表，如需修改行程请手动调整。');
      return;
    }

    // 1. 先检查必填字段：客户名称
    const clientId = getValues('clientId');
    if (!clientId) {
      alert('请选择客户，或者先在"客户管理"录入客户信息，再选择客户。');
      return;
    }

    // 2. 检查报价单号是否重复
    const quotationNumber = getValues('quotationNumber');
    if (!quotationNumber) {
      alert('请输入报价单号。');
      return;
    }

    // 查询数据库中是否已存在相同报价单号
    const { data: existingQuotation } = await supabase
      .from('quotations')
      .select('id')
      .eq('quotation_number', quotationNumber)
      .maybeSingle();

    if (existingQuotation) {
      alert('报价单号重复，请修改报价单号。');
      return;
    }

    // 3. 生成行程表
    const days = getValues('days') || 1;
    const newSchedule = Array.from({ length: days }, (_, i) => ({
      day: i + 1,
      morning: [],
      noon: { supplierId: '', cost: 0 },
      afternoon: [],
      evening: { supplierId: '', cost: 0 },
      busId: '',
      busDuration: 'full' as const,
      busCost: 0,
    }));
    setSchedule(newSchedule);
    setHotelArrangement(prev => ({ ...prev, nights: days - 1 > 0 ? days - 1 : 0 }));
    setCurrentQuotationId(null);
    localStorage.removeItem('quotation_draft');
  };

  const calculateCosts = () => {
    let totalCost = 0; // 预算总成本
    let totalActualCost = 0; // 实际总成本
    const participants = getValues('participants') || 1;

    // Hotel cost
    if (hotelArrangement.hotelId) {
      totalCost += (hotelArrangement.cost || 0);
      totalActualCost += (hotelArrangement.actualCost || hotelArrangement.cost || 0);
    }

    // Schedule cost
    schedule.forEach(day => {
      day.morning.forEach(act => {
        totalCost += act.cost;
        totalActualCost += act.actualCost ?? act.cost;
        if (act.venueCost) {
          totalCost += act.venueCost;
          totalActualCost += act.venueActualCost ?? act.venueCost;
        }
      });
      day.afternoon.forEach(act => {
        totalCost += act.cost;
        totalActualCost += act.actualCost ?? act.cost;
        if (act.venueCost) {
          totalCost += act.venueCost;
          totalActualCost += act.venueActualCost ?? act.venueCost;
        }
      });
      totalCost += day.noon.cost;
      totalActualCost += day.noon.actualCost ?? day.noon.cost;
      totalCost += day.evening.cost;
      totalActualCost += day.evening.actualCost ?? day.evening.cost;
      totalCost += day.busCost;
      totalActualCost += day.busActualCost ?? day.busCost;
    });

    const maxBudget = getValues('maxBudget') || 0;
    const quotedPricePerPerson = getValues('quotedPricePerPerson') || 0;
    const quotedTotalPrice = getValues('quotedTotalPrice') || 0;

    let totalBudget = 0;
    if (quotedTotalPrice > 0) {
      totalBudget = quotedTotalPrice;
    } else if (quotedPricePerPerson > 0) {
      totalBudget = quotedPricePerPerson * participants;
    } else {
      totalBudget = maxBudget;
    }

    const profit = totalBudget - totalCost;
    const profitMargin = totalBudget > 0 ? (profit / totalBudget) * 100 : 0;
    const actualProfit = totalBudget - totalActualCost; // 基于实际成本的利润
    const actualProfitMargin = totalBudget > 0 ? (actualProfit / totalBudget) * 100 : 0;

    return { totalCost, totalActualCost, totalBudget, profit, profitMargin, actualProfit, actualProfitMargin };
  };

  const generateManualProposal = async () => {
    setIsGeneratingManual(true);
    setManualError(null);
    setManualProposal(null);

    try {
      const data = getValues();
      
      const hotel = suppliers.find(s => s.id === hotelArrangement.hotelId);
      const hotelContext = hotel ? `酒店安排：${hotel.name}，入住 ${hotelArrangement.nights} 晚，每间 ${hotelArrangement.peoplePerRoom} 人。` : '酒店安排：未指定';

      const scheduleContext = schedule.map(day => {
        const morningActs = day.morning.map(act => {
          const supplier = suppliers.find(s => s.id === act.supplierId);
          if (act.type === 'visit') return `参访：${supplier ? supplier.name : '未指定'}`;
          return `授课：${supplier ? supplier.name : '未指定'} - 课程：${act.courseName || '未指定'} (${act.hours || 0}课时, ${act.language || '中文'}) - 场地：${act.venueId ? suppliers.find(s => s.id === act.venueId)?.name : '未指定'}`;
        }).join('；');

        const afternoonActs = day.afternoon.map(act => {
          const supplier = suppliers.find(s => s.id === act.supplierId);
          if (act.type === 'visit') return `参访：${supplier ? supplier.name : '未指定'}`;
          return `授课：${supplier ? supplier.name : '未指定'} - 课程：${act.courseName || '未指定'} (${act.hours || 0}课时, ${act.language || '中文'}) - 场地：${act.venueId ? suppliers.find(s => s.id === act.venueId)?.name : '未指定'}`;
        }).join('；');

        const noonSupplier = suppliers.find(s => s.id === day.noon.supplierId);
        const eveningSupplier = suppliers.find(s => s.id === day.evening.supplierId);
        const busSupplier = suppliers.find(s => s.id === day.busId);
        const busDurationText = day.busDuration === 'half' ? '半天' : '全天';

        return `第 ${day.day} 天：
- 上午：${morningActs || '无安排'}
- 中午餐饮：${noonSupplier ? noonSupplier.name : '未安排'}
- 下午：${afternoonActs || '无安排'}
- 晚上餐饮：${eveningSupplier ? eveningSupplier.name : '未安排'}
- 大巴：${busSupplier ? `${busSupplier.name} (${busDurationText})` : '未安排'}`;
      }).join('\n\n');

      const quotedPriceInfo = data.quotedTotalPrice
        ? `项目总报价：¥${data.quotedTotalPrice}`
        : (data.quotedPricePerPerson ? `单人报价：¥${data.quotedPricePerPerson}，总报价：¥${data.quotedPricePerPerson * data.participants}` : `最高预算：¥${data.maxBudget}`);

      // Use custom prompt template if available
      let prompt = promptTemplate || `你是一个专业的游学/培训项目产品经理。请根据以下客户需求和我们已经人工配置好的行程安排，自动生成一份给客户的正式项目方案。

【客户需求】
- 项目名称：{projectName}
- 客户名称：{clientName}
- 参访人数：{participants} 人
- 参访天数：{days} 天
- 报价信息：{quotedPriceInfo}

【已配置行程安排】
{hotelContext}

{scheduleContext}

【输出要求】
1. 方案概述：简述方案的整体思路和亮点。
2. 详细行程：将上述已配置的行程安排润色成适合发给客户看的详细行程描述。
3. 报价说明：请引用上述的报价信息（如果有单人报价和总价，请都列出），并说明这是一个高品质的定制方案，包含上述行程中的所有项目。请不要列出我们的成本价。

请使用 Markdown 格式输出，排版清晰美观，语言专业热情。`;

      // Replace placeholders with actual values
      prompt = prompt
        .replace('{projectName}', data.projectName)
        .replace('{clientName}', data.clientName)
        .replace('{participants}', String(data.participants))
        .replace('{days}', String(data.days))
        .replace('{quotedPriceInfo}', quotedPriceInfo)
        .replace('{hotelContext}', hotelContext)
        .replace('{scheduleContext}', scheduleContext);

      const ai = new DashScope();
      const response = await ai.call({
        model: 'qwen-plus',
        messages: [
          {
            role: 'system',
            content: '你是一个专业的游学/培训项目产品经理。'
          },
          {
            role: 'user',
            content: prompt
          }
        ]
      });

      if (response.output?.text) {
        setManualProposal(response.output.text);
        setEditableProposal(response.output.text);
        setIsEditingProposal(false);
      } else {
        throw new Error('生成方案失败，返回内容为空');
      }
    } catch (err: any) {
      console.error('Error generating manual proposal:', err);
      setManualError(err.message || '生成方案时发生未知错误');
    } finally {
      setIsGeneratingManual(false);
    }
  };

  const exportToPDF = () => {
    console.log('Exporting to PDF...');
    const element = document.getElementById('proposal-export-content');
    if (element) {
      const quotationNumber = getValues('quotationNumber') || 'unknown';
      
      const opt = {
        margin:       10,
        filename:     `项目报价-${quotationNumber}.pdf`,
        image:        { type: 'jpeg' as const, quality: 0.98 },
        html2canvas:  { 
          scale: 2, 
          useCORS: true, 
          logging: true,
          onclone: (clonedDoc: Document) => {
            // Aggressively remove all styles that might contain oklch
            const styles = clonedDoc.querySelectorAll('style, link[rel="stylesheet"]');
            styles.forEach(s => s.remove());
            
            const style = clonedDoc.createElement('style');
            style.innerHTML = `
              @page { size: A4; margin: 10mm; }
              body { 
                font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; 
                color: #334155; 
                background: white; 
                padding: 0;
                margin: 0;
                -webkit-font-smoothing: antialiased;
              }
              #proposal-export-content { 
                display: block !important; 
                width: 100% !important;
                padding: 40px !important;
                box-sizing: border-box !important;
              }
              h1 { font-size: 24pt; margin-bottom: 20pt; color: #0f172a; border-bottom: 2px solid #e2e8f0; padding-bottom: 10pt; }
              h2 { font-size: 18pt; margin-top: 25pt; margin-bottom: 15pt; color: #1e293b; border-bottom: 1px solid #f1f5f9; padding-bottom: 5pt; }
              h3 { font-size: 14pt; margin-top: 20pt; margin-bottom: 10pt; color: #334155; }
              p { font-size: 11pt; margin-bottom: 12pt; line-height: 1.6; color: #475569; }
              ul, ol { margin-bottom: 12pt; padding-left: 20pt; }
              li { font-size: 11pt; margin-bottom: 6pt; line-height: 1.5; color: #475569; }
              strong { color: #0f172a; font-weight: bold; }
              hr { border: 0; border-top: 1px solid #e2e8f0; margin: 20pt 0; }
              table { width: 100%; border-collapse: collapse; margin-bottom: 15pt; }
              th, td { border: 1px solid #e2e8f0; padding: 8pt; text-align: left; font-size: 10pt; }
              th { background-color: #f8fafc; font-weight: bold; }
            `;
            clonedDoc.head.appendChild(style);

            // Force display and remove any hidden classes
            const exportEl = clonedDoc.getElementById('proposal-export-content');
            if (exportEl) {
              exportEl.style.display = 'block';
              exportEl.style.visibility = 'visible';
              exportEl.style.opacity = '1';
              exportEl.style.color = '#334155';
              exportEl.style.backgroundColor = '#ffffff';
              
              // Remove all classes to avoid oklch from Tailwind
              const all = exportEl.querySelectorAll('*');
              all.forEach(el => {
                const htmlEl = el as HTMLElement;
                htmlEl.removeAttribute('class');
                // Ensure no oklch in inline styles
                if (htmlEl.style.color?.includes('oklch')) htmlEl.style.color = '#334155';
                if (htmlEl.style.backgroundColor?.includes('oklch')) htmlEl.style.backgroundColor = '#ffffff';
              });
            }
          }
        },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' as const },
        pagebreak:    { mode: ['avoid-all', 'css', 'legacy'] }
      };
      
      html2pdf().set(opt).from(element).save().then(() => {
        console.log('PDF exported successfully');
      }).catch(err => {
        console.error('PDF Export Error:', err);
        alert('导出PDF失败: ' + err.message);
      });
    } else {
      console.error('Export element not found');
      alert('导出失败：找不到导出内容');
    }
  };

  const exportToWord = () => {
    console.log('Exporting to Word...');
    const element = document.getElementById('proposal-export-content');
    if (element) {
      try {
        const header = "<html xmlns:o='urn:schemas-microsoft-com:office:office' "+
              "xmlns:w='urn:schemas-microsoft-com:office:word' "+
              "xmlns='http://www.w3.org/TR/REC-html40'>"+
              "<head><meta charset='utf-8'><title>Export HTML to Word</title>"+
              "<style>body { font-family: sans-serif; line-height: 1.6; color: #333; } h1 { font-size: 24pt; border-bottom: 2px solid #eee; padding-bottom: 5px; color: #000; } h2 { font-size: 18pt; border-bottom: 1px solid #eee; padding-bottom: 5px; color: #000; } hr { border: 0; border-top: 1px solid #eee; margin: 20px 0; } table { border-collapse: collapse; width: 100%; } th, td { border: 1px solid #ccc; padding: 8px; }</style>"+
              "</head><body>";
        const footer = "</body></html>";
        
        // Clone element to remove any hidden attributes or styles that might interfere
        const clone = element.cloneNode(true) as HTMLElement;
        clone.style.display = 'block';
        clone.style.visibility = 'visible';
        
        const sourceHTML = header + clone.innerHTML + footer;
        
        const blob = new Blob(['\ufeff', sourceHTML], {
          type: 'application/msword'
        });
        
        const url = URL.createObjectURL(blob);
        const fileDownload = document.createElement("a");
        document.body.appendChild(fileDownload);
        fileDownload.href = url;
        fileDownload.download = `项目报价方案-${getValues('quotationNumber') || 'draft'}.doc`;
        fileDownload.click();
        document.body.removeChild(fileDownload);
        URL.revokeObjectURL(url);
        console.log('Word exported successfully');
      } catch (err) {
        console.error('Word Export Error:', err);
        alert('导出Word失败');
      }
    } else {
      console.error('Export element not found');
      alert('导出失败：找不到导出内容');
    }
  };

  const saveQuotation = async () => {
    if (!user) return;
    const contentToSave = editableProposal || manualProposal || '';
    const { totalCost, totalActualCost, totalBudget, profit, profitMargin, actualProfit, actualProfitMargin } = calculateCosts();
    console.log('Saving quotation with content length:', contentToSave.length);
    const nameToSave = getValues('projectName') || '未命名报价单';
    const clientToSave = getValues('clientName') || '未知客户';
    const clientIdToSave = getValues('clientId');
    const quotationNumber = getValues('quotationNumber');
    const formData = getValues();

    const details = {
      projectName: formData.projectName,
      clientName: formData.clientName,
      clientId: formData.clientId,
      participants: formData.participants,
      days: formData.days,
      maxBudget: formData.maxBudget,
      quotedPricePerPerson: formData.quotedPricePerPerson,
      quotedTotalPrice: formData.quotedTotalPrice,
      quotationNumber: formData.quotationNumber,
      schedule,
      hotelArrangement,
      calculations: {
        totalReferencePrice: totalCost,
        totalActualCost: totalActualCost,
        totalBudget: totalBudget,
        markupAmount: profit,
        markupRate: profitMargin,
        actualProfit: actualProfit,
        actualProfitMargin: actualProfitMargin
      }
    };

    const ensureNumber = (val: any) => {
      if (val === "" || val === undefined || val === null) return 0;
      const num = Number(val);
      return isNaN(num) ? 0 : num;
    };

    try {
      const payload = {
        name: nameToSave,
        client_name: clientToSave,
        client_id: clientIdToSave,
        quotation_number: quotationNumber,
        participants: ensureNumber(formData.participants),
        days: ensureNumber(formData.days),
        max_budget: ensureNumber(formData.maxBudget),
        quoted_price_per_person: ensureNumber(formData.quotedPricePerPerson),
        quoted_total_price: ensureNumber(formData.quotedTotalPrice),
        reference_price_total: ensureNumber(totalCost), // 总参考价格（基于 reference_quote）
        actual_cost_total: ensureNumber(totalActualCost), // 总实际成本（基于 actual_cost）
        markup_amount: ensureNumber(profit), // 参考价上浮金额
        markup_rate: ensureNumber(profitMargin), // 参考价上浮率
        content: contentToSave,
        details: details,
        created_by: user.id
      };

      let error;
      let targetId = currentQuotationId;

      // 新增模式：检查报价单号是否重复
      if (!targetId) {
        const { data: existing, error: fetchError } = await supabase
          .from('quotations')
          .select('id')
          .eq('quotation_number', quotationNumber)
          .maybeSingle();

        if (existing) {
          alert('报价单号重复，请修改报价单号。');
          return;
        }
      }

      if (targetId) {
        // 修改模式：更新现有报价单
        const { error: updateError } = await supabase
          .from('quotations')
          .update(payload)
          .eq('id', targetId);
        error = updateError;
      } else {
        // 新增模式：创建新报价单
        const { error: insertError } = await supabase
          .from('quotations')
          .insert([payload]);
        error = insertError;
      }

      if (error) throw error;
      localStorage.removeItem('quotation_draft');
      alert(currentQuotationId ? '报价单已成功更新！' : '报价单已成功存档！');
      fetchHistory();
    } catch (err) {
      console.error('Error saving quotation:', err);
      alert('存档失败，请检查数据库 schema 是否已更新。');
    }
  };

  const createProjectFromQuotation = async (quotation: any) => {
    if (!user) return;
    if (!confirm('确定要基于此报价单发起项目吗？')) return;

    // Navigate to projects page with state to open the form
    navigate('/projects', { 
      state: { 
        openForm: true, 
        quotationData: quotation 
      } 
    });
  };

  const updateHotel = (field: keyof HotelArrangement, value: any) => {
    const newHotel = { ...hotelArrangement, [field]: value };

    if (field === 'hotelId' || field === 'nights' || field === 'peoplePerRoom') {
      const hotel = suppliers.find(s => s.id === (field === 'hotelId' ? value : newHotel.hotelId));
      if (hotel) {
        // 预算成本：使用 reference_quote
        const unitPrice = hotel.reference_quote?.unit || hotel.price || 0;
        const roomsNeeded = Math.ceil(participants / (field === 'peoplePerRoom' ? value : newHotel.peoplePerRoom));
        const nights = field === 'nights' ? value : newHotel.nights;
        newHotel.cost = unitPrice * roomsNeeded * nights;

        // 实际成本：使用 actual_cost
        const actualUnitPrice = hotel.actual_cost?.unit || 0;
        newHotel.actualCost = actualUnitPrice * roomsNeeded * nights;
      }
    }

    setHotelArrangement(newHotel);
  };

  useEffect(() => {
    if (hotelArrangement.hotelId) {
      const hotel = suppliers.find(s => s.id === hotelArrangement.hotelId);
      if (hotel) {
        const roomsNeeded = Math.ceil(participants / hotelArrangement.peoplePerRoom);
        // 预算成本
        const unitPrice = hotel.reference_quote?.unit || hotel.price || 0;
        const budgetCost = unitPrice * roomsNeeded * hotelArrangement.nights;
        // 实际成本
        const actualUnitPrice = hotel.actual_cost?.unit || 0;
        const actualCost = actualUnitPrice * roomsNeeded * hotelArrangement.nights;
        setHotelArrangement(prev => ({ ...prev, cost: budgetCost, actualCost }));
      }
    }
  }, [participants]);

  const updateSchedule = (dayIndex: number, field: keyof DailySchedule, value: any) => {
    const newSchedule = [...schedule];
    newSchedule[dayIndex] = { ...newSchedule[dayIndex], [field]: value };
    setSchedule(newSchedule);
  };

  const addActivity = (dayIndex: number, time: 'morning' | 'afternoon', type: 'visit' | 'teach') => {
    const newSchedule = [...schedule];
    newSchedule[dayIndex][time].push({
      id: crypto.randomUUID(),
      type,
      supplierId: '',
      cost: 0,
      venueCost: 0,
      venueBillingType: 'hour',
    });
    setSchedule(newSchedule);
  };

  const removeActivity = (dayIndex: number, time: 'morning' | 'afternoon', activityId: string) => {
    const newSchedule = [...schedule];
    newSchedule[dayIndex][time] = newSchedule[dayIndex][time].filter(a => a.id !== activityId);
    setSchedule(newSchedule);
  };

  const updateActivity = (dayIndex: number, time: 'morning' | 'afternoon', activityId: string, field: keyof Activity, value: any) => {
    const newSchedule = [...schedule];
    const actIndex = newSchedule[dayIndex][time].findIndex(a => a.id === activityId);
    if (actIndex > -1) {
      newSchedule[dayIndex][time][actIndex] = { ...newSchedule[dayIndex][time][actIndex], [field]: value };

      const currentAct = newSchedule[dayIndex][time][actIndex];
      const participants = getValues('participants') || 1;

      // Auto-update cost if supplier changes
      if (field === 'supplierId' || field === 'hours' || field === 'billingType') {
        const supplier = suppliers.find(s => s.id === currentAct.supplierId);
        if (supplier) {
          if (currentAct.type === 'visit') {
            // 参访：预算 = reference_quote.unit × 人数，实际 = actual_cost.unit × 人数
            const budgetUnitPrice = supplier.reference_quote?.unit || supplier.price || 0;
            const actualUnitPrice = supplier.actual_cost?.unit || 0;
            currentAct.cost = budgetUnitPrice * participants;
            currentAct.actualCost = actualUnitPrice * participants;
          } else {
            // 老师授课
            const billingType = currentAct.billingType || 'hour';

            // 预算价格
            const budgetHourPrice = supplier.reference_quote?.hour || supplier.price || 0;
            const budgetHalfDayPrice = supplier.reference_quote?.half_day || (budgetHourPrice * 4);
            const budgetDayPrice = supplier.reference_quote?.day || (budgetHourPrice * 8);

            // 实际价格
            const actualHourPrice = supplier.actual_cost?.hour || 0;
            const actualHalfDayPrice = supplier.actual_cost?.half_day || 0;
            const actualDayPrice = supplier.actual_cost?.day || 0;

            if (billingType === 'day') {
              currentAct.cost = budgetDayPrice;
              currentAct.actualCost = actualDayPrice;
              // Sync to afternoon if morning is set to 'day'
              if (time === 'morning') {
                const afternoonAct = newSchedule[dayIndex].afternoon.find(a => a.type === 'teach' && !a.supplierId);
                if (afternoonAct) {
                  afternoonAct.supplierId = currentAct.supplierId;
                  afternoonAct.courseName = currentAct.courseName;
                  afternoonAct.language = currentAct.language;
                  afternoonAct.billingType = 'day';
                  afternoonAct.cost = 0;
                  afternoonAct.actualCost = 0;
                }
              }
            } else if (billingType === 'half_day') {
              currentAct.cost = budgetHalfDayPrice;
              currentAct.actualCost = actualHalfDayPrice;
            } else {
              currentAct.cost = budgetHourPrice * (currentAct.hours || 0);
              currentAct.actualCost = actualHourPrice * (currentAct.hours || 0);
            }
          }
        }
      }

      // Auto-update venue cost if venue or hours change
      if (field === 'venueId' || field === 'venueHours' || field === 'venueBillingType') {
        const venue = suppliers.find(s => s.id === currentAct.venueId);
        if (venue) {
          const billingType = currentAct.venueBillingType || 'hour';

          // 预算价格
          const budgetHourPrice = venue.reference_quote?.hour || venue.price || 0;
          const budgetHalfDayPrice = venue.reference_quote?.half_day || (budgetHourPrice * 4);
          const budgetDayPrice = venue.reference_quote?.day || (budgetHourPrice * 8);

          // 实际价格
          const actualHourPrice = venue.actual_cost?.hour || 0;
          const actualHalfDayPrice = venue.actual_cost?.half_day || 0;
          const actualDayPrice = venue.actual_cost?.day || 0;

          if (billingType === 'day') {
            currentAct.venueCost = budgetDayPrice;
            currentAct.venueActualCost = actualDayPrice;
            // Sync venue to afternoon if morning is set to 'day'
            if (time === 'morning') {
              const afternoonAct = newSchedule[dayIndex].afternoon.find(a => a.type === 'teach' && a.supplierId === currentAct.supplierId);
              if (afternoonAct) {
                afternoonAct.venueId = currentAct.venueId;
                afternoonAct.venueBillingType = 'day';
                afternoonAct.venueCost = 0;
                afternoonAct.venueActualCost = 0;
              }
            }
          } else if (billingType === 'half_day') {
            currentAct.venueCost = budgetHalfDayPrice;
            currentAct.venueActualCost = actualHalfDayPrice;
          } else {
            currentAct.venueCost = budgetHourPrice * (currentAct.venueHours || 0);
            currentAct.venueActualCost = actualHourPrice * (currentAct.venueHours || 0);
          }
        } else {
          currentAct.venueCost = 0;
          currentAct.venueActualCost = 0;
        }
      }

      setSchedule(newSchedule);
    }
  };

  const updateMeal = (dayIndex: number, time: 'noon' | 'evening', field: keyof Meal, value: any) => {
    const newSchedule = [...schedule];
    newSchedule[dayIndex][time] = { ...newSchedule[dayIndex][time], [field]: value };

    if (field === 'supplierId') {
      const supplier = suppliers.find(s => s.id === value);
      if (supplier) {
        const participants = getValues('participants') || 1;
        // 预算成本：reference_quote
        const budgetUnitPrice = supplier.reference_quote?.unit || supplier.price || 0;
        // 实际成本：actual_cost
        const actualUnitPrice = supplier.actual_cost?.unit || 0;
        newSchedule[dayIndex][time].cost = budgetUnitPrice * participants;
        newSchedule[dayIndex][time].actualCost = actualUnitPrice * participants;
      }
    }
    setSchedule(newSchedule);
  };

  const updateBus = (dayIndex: number, field: 'busId' | 'busDuration' | 'busHours', value: any) => {
    const newSchedule = [...schedule];
    newSchedule[dayIndex] = { ...newSchedule[dayIndex], [field]: value };

    const supplier = suppliers.find(s => s.id === newSchedule[dayIndex].busId);
    if (supplier) {
      // 预算价格
      const budgetHourPrice = supplier.reference_quote?.hour || (supplier.price / 8);
      const budgetHalfDayPrice = supplier.reference_quote?.half_day || (budgetHourPrice * 4);
      const budgetDayPrice = supplier.reference_quote?.day || supplier.price;

      // 实际价格
      const actualHourPrice = supplier.actual_cost?.hour || 0;
      const actualHalfDayPrice = supplier.actual_cost?.half_day || 0;
      const actualDayPrice = supplier.actual_cost?.day || 0;

      if (newSchedule[dayIndex].busDuration === 'hour') {
        newSchedule[dayIndex].busCost = budgetHourPrice * (newSchedule[dayIndex].busHours || 0);
        newSchedule[dayIndex].busActualCost = actualHourPrice * (newSchedule[dayIndex].busHours || 0);
      } else if (newSchedule[dayIndex].busDuration === 'half') {
        newSchedule[dayIndex].busCost = budgetHalfDayPrice;
        newSchedule[dayIndex].busActualCost = actualHalfDayPrice;
      } else if (newSchedule[dayIndex].busDuration === 'none') {
        newSchedule[dayIndex].busCost = 0;
        newSchedule[dayIndex].busActualCost = 0;
      } else {
        newSchedule[dayIndex].busCost = budgetDayPrice;
        newSchedule[dayIndex].busActualCost = actualDayPrice;
      }
    } else {
      newSchedule[dayIndex].busCost = 0;
      newSchedule[dayIndex].busActualCost = 0;
    }
    setSchedule(newSchedule);
  };

  const loadQuotation = (quotation: any) => {
    setCurrentQuotationId(quotation.id);
    const details = quotation.details || {};
    setValue('projectName', details.projectName || quotation.name || '');
    setValue('clientName', details.clientName || quotation.client_name || '');
    setValue('clientId', details.clientId || quotation.client_id || '');
    setValue('participants', details.participants || quotation.participants || 0);
    setValue('days', details.days || quotation.days || 0);
    setValue('maxBudget', details.maxBudget || quotation.max_budget || 0);
    setValue('quotedPricePerPerson', details.quotedPricePerPerson || quotation.quoted_price_per_person || 0);
    setValue('quotedTotalPrice', details.quotedTotalPrice || quotation.quoted_total_price || 0);
    setValue('quotationNumber', quotation.quotation_number || details.quotationNumber || '');

    setSchedule(details.schedule || []);
    setHotelArrangement(details.hotelArrangement || {
      hotelId: '',
      nights: 0,
      peoplePerRoom: 2,
      cost: 0,
      actualCost: 0,
    });
    setManualProposal(quotation.content || '');
    setEditableProposal(quotation.content || '');
    setActiveTab('manual');

    // 滚动到顶部方便编辑
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const resetForm = () => {
    if (confirm('确定要重置当前报价单吗？未保存的更改将丢失。')) {
      setCurrentQuotationId(null);
      setValue('projectName', '');
      setValue('clientName', '');
      setValue('clientId', '');
      setValue('participants', 20);
      setValue('days', 3);
      setValue('maxBudget', 100000);
      setValue('quotedPricePerPerson', 0);
      setValue('quotedTotalPrice', 0);
      setValue('quotationNumber', generateQuotationNumber());
      setSchedule([]);
      setHotelArrangement({ hotelId: '', nights: 0, peoplePerRoom: 2, cost: 0 });
      setManualProposal(null);
      setEditableProposal('');
      localStorage.removeItem('quotation_draft');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">项目报价</h1>
          <p className="text-sm text-slate-500 mt-1">根据客户需求，快速生成项目方案与成本测算。</p>
        </div>
        <div className="flex bg-slate-100 p-1 rounded-lg">
          <button
            onClick={() => setActiveTab('manual')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === 'manual' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Calculator className="w-4 h-4 inline mr-2" />
            项目报价
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === 'history' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <History className="w-4 h-4 inline mr-2" />
            历史记录
          </button>
          <button
            onClick={() => setActiveTab('prompt')}
            disabled={isAccountManager || isOperationManager}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
              activeTab === 'prompt' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Sparkles className="w-4 h-4 inline mr-2" />
            提示词配置
          </button>
        </div>
      </div>

      {activeTab === 'manual' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* 左侧表单 */}
          <div className="lg:col-span-3 bg-white rounded-xl shadow-sm border border-slate-200 p-6 h-fit sticky top-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-900 flex items-center">
                <FileText className="w-5 h-5 mr-2 text-indigo-500" />
                需求输入
              </h3>
              {currentQuotationId && (
                <button
                  onClick={resetForm}
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                >
                  新建报价
                </button>
              )}
            </div>
            <form className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">项目名称</label>
                <input {...register('projectName')} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" placeholder="例如：新加坡科技游学营" />
                {errors.projectName && <p className="text-red-500 text-xs mt-1">{errors.projectName.message}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">报价单号</label>
                <input
                  {...register('quotationNumber')}
                  disabled={!!currentQuotationId}
                  className={`w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 ${currentQuotationId ? 'bg-slate-100 text-slate-500' : ''}`}
                  placeholder="自动生成或手动输入"
                />
                {currentQuotationId && <p className="text-xs text-slate-400 mt-1">修改模式下报价单号不可更改</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">客户名称</label>
                <select
                  value={watch('clientId') || ''}
                  onChange={(e) => {
                    const client = clients.find(c => c.id === e.target.value);
                    if (client) {
                      setValue('clientId', client.id);
                      setValue('clientName', client.name);
                    } else {
                      setValue('clientId', '');
                      setValue('clientName', '');
                    }
                  }}
                  disabled={!!currentQuotationId}
                  className={`w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 ${currentQuotationId ? 'bg-slate-100 text-slate-500' : ''}`}
                >
                  <option value="">请选择客户</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                {currentQuotationId && <p className="text-xs text-slate-400 mt-1">修改模式下客户不可更改</p>}
                {errors.clientId && <p className="text-red-500 text-xs mt-1">{errors.clientId.message}</p>}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">参访人数</label>
                  <input type="number" {...register('participants')} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
                  {errors.participants && <p className="text-red-500 text-xs mt-1">{errors.participants.message}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">参访天数</label>
                  <input type="number" {...register('days')} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
                  {errors.days && <p className="text-red-500 text-xs mt-1">{errors.days.message}</p>}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">最高预算 (总额)</label>
                <input type="number" {...register('maxBudget')} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
                {errors.maxBudget && <p className="text-red-500 text-xs mt-1">{errors.maxBudget.message}</p>}
              </div>

              <div className="pt-4 flex gap-2">
                <button
                  type="button"
                  onClick={async () => { await generateScheduleTable(); }}
                  className="flex-1 bg-indigo-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-indigo-700 flex items-center justify-center transition-colors"
                >
                  <Calculator className="w-4 h-4 mr-2" />
                  生成行程表
                </button>
                <button
                  type="button"
                  onClick={saveDraft}
                  className="px-4 py-2.5 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200 flex items-center justify-center transition-colors"
                  title="暂存草稿"
                >
                  <Save className="w-4 h-4" />
                </button>
              </div>
            </form>
          </div>

          {/* 右侧行程表和方案 */}
          <div className="lg:col-span-9 space-y-6">
            {schedule.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold text-slate-900">行程安排与参考价格</h3>
                </div>
                
                {/* Hotel Arrangement Section */}
                <div className="mb-6 p-4 bg-slate-50 rounded-lg border border-slate-200">
                  <h4 className="font-medium text-slate-900 mb-3 flex items-center">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 mr-2"></span>
                    统一酒店安排
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
                    <div className="sm:col-span-1">
                      <label className="block text-xs font-medium text-slate-700 mb-1">选择酒店</label>
                      <select 
                        value={hotelArrangement.hotelId} 
                        onChange={(e) => updateHotel('hotelId', e.target.value)}
                        className="w-full rounded-md border-slate-300 text-sm focus:border-indigo-500 focus:ring-indigo-500"
                      >
                        <option value="">请选择酒店</option>
                        {suppliers.filter(s => s.type === '酒店').map(s => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">入住晚数</label>
                      <input 
                        type="number" 
                        value={hotelArrangement.nights}
                        onChange={(e) => updateHotel('nights', parseInt(e.target.value) || 0)}
                        className="w-full rounded-md border-slate-300 text-sm focus:border-indigo-500 focus:ring-indigo-500" 
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">每间人数</label>
                      <input 
                        type="number" 
                        value={hotelArrangement.peoplePerRoom}
                        onChange={(e) => updateHotel('peoplePerRoom', parseInt(e.target.value) || 1)}
                        className="w-full rounded-md border-slate-300 text-sm focus:border-indigo-500 focus:ring-indigo-500" 
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">酒店参考价格 (¥)</label>
                      <input 
                        type="number" 
                        value={hotelArrangement.cost}
                        onChange={(e) => updateHotel('cost', parseFloat(e.target.value) || 0)}
                        className="w-full rounded-md border-slate-300 text-sm font-bold text-indigo-600 focus:border-indigo-500 focus:ring-indigo-500" 
                      />
                    </div>
                  </div>
                  {hotelArrangement.hotelId && (
                    <div className="mt-3 flex justify-between items-center text-xs text-slate-500 bg-white p-2 rounded border border-slate-100">
                      {(() => {
                        const hotel = suppliers.find(s => s.id === hotelArrangement.hotelId);
                        const unitPrice = hotel?.reference_quote?.unit || hotel?.price || 0;
                        const roomsNeeded = Math.ceil(participants / hotelArrangement.peoplePerRoom);
                        return (
                          <>
                            <span>参考单价: ¥{unitPrice}/晚</span>
                            <span>参考房间数: {roomsNeeded}</span>
                            <span className="font-bold text-indigo-600">当前参考价格: ¥{hotelArrangement.cost.toLocaleString()}</span>
                          </>
                        );
                      })()}
                    </div>
                  )}
                </div>

                <div className="space-y-6">
                  {schedule.map((day, dayIndex) => (
                    <div key={dayIndex} className="border border-slate-200 rounded-lg overflow-hidden">
                      <div className="bg-slate-100 px-4 py-2 font-medium text-slate-800 border-b border-slate-200 flex justify-between items-center">
                        <span>第 {day.day} 天</span>
                        <div className="flex items-center space-x-2">
                          <span className="text-xs text-slate-500">大巴服务:</span>
                          <select 
                            value={day.busId} 
                            onChange={(e) => updateBus(dayIndex, 'busId', e.target.value)}
                            className="rounded-md border-slate-300 text-xs py-1 pl-2 pr-8 focus:border-indigo-500 focus:ring-indigo-500"
                          >
                            <option value="">不需要大巴</option>
                            {suppliers.filter(s => s.type === '大巴').map(s => (
                              <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                          </select>
                          {day.busId && (
                            <div className="flex items-center space-x-1">
                              <select
                                value={day.busDuration || 'full'}
                                onChange={(e) => updateBus(dayIndex, 'busDuration', e.target.value)}
                                className="rounded-md border-slate-300 text-xs py-1 pl-2 pr-8 focus:border-indigo-500 focus:ring-indigo-500"
                              >
                                <option value="full">全天</option>
                                <option value="half">半天</option>
                                <option value="hour">按小时</option>
                              </select>
                              {day.busDuration === 'hour' && (
                                <input 
                                  type="number" 
                                  value={day.busHours || 0}
                                  onChange={(e) => updateBus(dayIndex, 'busHours', parseInt(e.target.value) || 0)}
                                  className="w-12 rounded-md border-slate-300 text-xs py-1 px-2 focus:border-indigo-500 focus:ring-indigo-500" 
                                  placeholder="小时"
                                />
                              )}
                            </div>
                          )}
                          <input 
                            type="number" 
                            value={day.busCost}
                            onChange={(e) => updateSchedule(dayIndex, 'busCost', parseFloat(e.target.value) || 0)}
                            className="w-20 rounded-md border-slate-300 text-xs py-1 px-2 focus:border-indigo-500 focus:ring-indigo-500" 
                            placeholder="参考价格"
                          />
                        </div>
                      </div>
                      
                      <div className="p-4 space-y-4">
                        {/* Morning */}
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <h5 className="text-sm font-medium text-slate-700">上午安排</h5>
                            <div className="flex space-x-2">
                              <button type="button" onClick={() => addActivity(dayIndex, 'morning', 'visit')} className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center"><Plus className="w-3 h-3 mr-1" /> 参访</button>
                              <button type="button" onClick={() => addActivity(dayIndex, 'morning', 'teach')} className="text-xs text-emerald-600 hover:text-emerald-800 flex items-center"><Plus className="w-3 h-3 mr-1" /> 授课</button>
                            </div>
                          </div>
                          {day.morning.length === 0 && <p className="text-xs text-slate-400 italic">暂无安排</p>}
                          <div className="space-y-2">
                            {day.morning.map(act => (
                              <div key={act.id} className="flex items-start gap-2 p-2 bg-slate-50 rounded border border-slate-100">
                                <span className={`text-xs px-2 py-1 rounded text-white mt-1 ${act.type === 'visit' ? 'bg-indigo-500' : 'bg-emerald-500'}`}>
                                  {act.type === 'visit' ? '参访' : '授课'}
                                </span>
                                  <div className="flex-1 space-y-3">
                                    {/* 第一行：老师，按小时/半天/全天，（课时），课时费 */}
                                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-center">
                                      <select 
                                        value={act.supplierId} 
                                        onChange={(e) => updateActivity(dayIndex, 'morning', act.id, 'supplierId', e.target.value)}
                                        className="w-full rounded border-slate-300 text-xs py-1 focus:border-indigo-500 focus:ring-indigo-500"
                                      >
                                        <option value="">选择{act.type === 'visit' ? '参访点' : '讲师'}</option>
                                        {suppliers.filter(s => s.type === (act.type === 'visit' ? '参访点' : '老师')).map(s => (
                                          <option key={s.id} value={s.id}>{s.name}</option>
                                        ))}
                                      </select>
                                      
                                      {act.type === 'teach' && (
                                        <>
                                          <select
                                            value={act.billingType || 'hour'}
                                            onChange={(e) => updateActivity(dayIndex, 'morning', act.id, 'billingType', e.target.value)}
                                            className="text-xs border-slate-300 rounded-md py-1"
                                          >
                                            <option value="hour">按小时</option>
                                            <option value="half_day">按半天</option>
                                            <option value="day">按全天</option>
                                          </select>
                                          
                                          {(act.billingType === 'hour' || !act.billingType) ? (
                                            <div className="flex items-center space-x-1">
                                              <input
                                                type="number"
                                                value={act.hours || 0}
                                                onChange={(e) => updateActivity(dayIndex, 'morning', act.id, 'hours', Number(e.target.value))}
                                                className="w-12 text-xs border-slate-300 rounded-md px-1 py-1"
                                              />
                                              <span className="text-xs text-slate-500">小时</span>
                                            </div>
                                          ) : <div />}
                                          
                                          <div className="flex items-center space-x-2 bg-white p-1 rounded border border-slate-200">
                                            <span className="text-xs text-slate-500 whitespace-nowrap">课时参考价格:</span>
                                            <input
                                              type="number"
                                              value={act.cost}
                                              onChange={(e) => updateActivity(dayIndex, 'morning', act.id, 'cost', parseFloat(e.target.value) || 0)}
                                              className="w-full rounded border-transparent text-xs py-1 focus:border-indigo-500 focus:ring-0 text-right"
                                            />
                                          </div>
                                        </>
                                      )}
                                      
                                      {act.type === 'visit' && (
                                        <div className="flex items-center space-x-2 sm:col-span-3 bg-white p-1 rounded border border-slate-200">
                                          <span className="text-xs text-slate-500 whitespace-nowrap">参考价格:</span>
                                          <input
                                            type="number"
                                            value={act.cost}
                                            onChange={(e) => updateActivity(dayIndex, 'morning', act.id, 'cost', parseFloat(e.target.value) || 0)}
                                            className="w-full rounded border-transparent text-xs py-1 focus:border-indigo-500 focus:ring-0 text-right"
                                          />
                                        </div>
                                      )}
                                    </div>

                                    {/* 第二行：课程名称，语言 */}
                                    {act.type === 'teach' && (
                                      <div className="grid grid-cols-2 gap-2">
                                        <input 
                                          type="text" 
                                          placeholder="课程名称" 
                                          value={act.courseName || ''} 
                                          onChange={(e) => updateActivity(dayIndex, 'morning', act.id, 'courseName', e.target.value)} 
                                          className="w-full rounded border-slate-300 text-xs py-1 focus:border-indigo-500 focus:ring-indigo-500" 
                                        />
                                        <select 
                                          value={act.language || ''} 
                                          onChange={(e) => updateActivity(dayIndex, 'morning', act.id, 'language', e.target.value)} 
                                          className="w-full rounded border-slate-300 text-xs py-1 focus:border-indigo-500 focus:ring-indigo-500"
                                        >
                                          <option value="">选择语言</option>
                                          <option value="中文">中文</option>
                                          <option value="英文">英文</option>
                                          <option value="日文">日文</option>
                                          <option value="其他">其他</option>
                                        </select>
                                      </div>
                                    )}

                                    {/* 第三行：场地，按小时/半天/全天，场地费 */}
                                    {act.type === 'teach' && (
                                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-center">
                                        <select 
                                          value={act.venueId || ''} 
                                          onChange={(e) => updateActivity(dayIndex, 'morning', act.id, 'venueId', e.target.value)} 
                                          className="w-full rounded border-slate-300 text-xs py-1 focus:border-indigo-500 focus:ring-indigo-500"
                                        >
                                          <option value="">选择场地</option>
                                          {suppliers.filter(s => s.type === '场地').map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                        </select>
                                        
                                        <select
                                          value={act.venueBillingType || 'hour'}
                                          onChange={(e) => updateActivity(dayIndex, 'morning', act.id, 'venueBillingType', e.target.value)}
                                          className="text-xs border-slate-300 rounded-md py-1"
                                        >
                                          <option value="hour">按小时</option>
                                          <option value="half_day">按半天</option>
                                          <option value="day">按全天</option>
                                        </select>
                                        
                                        {(act.venueBillingType === 'hour' || !act.venueBillingType) ? (
                                          <div className="flex items-center space-x-1">
                                            <input
                                              type="number"
                                              value={act.venueHours || 0}
                                              onChange={(e) => updateActivity(dayIndex, 'morning', act.id, 'venueHours', Number(e.target.value))}
                                              className="w-12 text-xs border-slate-300 rounded-md px-1 py-1"
                                            />
                                            <span className="text-xs text-slate-500">小时</span>
                                          </div>
                                        ) : <div />}
                                        
                                        <div className="flex items-center space-x-2 bg-white p-1 rounded border border-slate-200">
                                          <span className="text-xs text-slate-500 whitespace-nowrap">场地参考价格:</span>
                                          <input
                                            type="number"
                                            value={act.venueCost || 0}
                                            onChange={(e) => updateActivity(dayIndex, 'morning', act.id, 'venueCost', parseFloat(e.target.value) || 0)}
                                            className="w-full rounded border-transparent text-xs py-1 focus:border-indigo-500 focus:ring-0 text-right"
                                          />
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                <button type="button" onClick={() => removeActivity(dayIndex, 'morning', act.id)} className="text-slate-400 hover:text-red-500 p-1"><Trash2 className="w-4 h-4" /></button>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Noon */}
                        <div className="flex items-center gap-2 bg-orange-50 p-2 rounded border border-orange-100">
                          <span className="text-xs font-medium text-orange-800 w-16">午餐</span>
                          <select 
                            value={day.noon.supplierId} 
                            onChange={(e) => updateMeal(dayIndex, 'noon', 'supplierId', e.target.value)}
                            className="flex-1 rounded border-orange-200 text-xs py-1 focus:border-orange-500 focus:ring-orange-500 bg-white"
                          >
                            <option value="">选择餐饮</option>
                            {suppliers.filter(s => s.type === '餐饮').map(s => (
                              <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                          </select>
                          <div className="flex items-center space-x-2 w-32 bg-white p-1 rounded border border-orange-200">
                            <span className="text-xs text-orange-800 whitespace-nowrap">参考价格:</span>
                            <input
                              type="number"
                              value={day.noon.cost}
                              onChange={(e) => updateMeal(dayIndex, 'noon', 'cost', parseFloat(e.target.value) || 0)}
                              className="w-full rounded border-transparent text-xs py-1 focus:border-orange-500 focus:ring-0 text-right"
                            />
                          </div>
                        </div>

                        {/* Afternoon */}
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <h5 className="text-sm font-medium text-slate-700">下午安排</h5>
                            <div className="flex space-x-2">
                              <button type="button" onClick={() => addActivity(dayIndex, 'afternoon', 'visit')} className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center"><Plus className="w-3 h-3 mr-1" /> 参访</button>
                              <button type="button" onClick={() => addActivity(dayIndex, 'afternoon', 'teach')} className="text-xs text-emerald-600 hover:text-emerald-800 flex items-center"><Plus className="w-3 h-3 mr-1" /> 授课</button>
                            </div>
                          </div>
                          {day.afternoon.length === 0 && <p className="text-xs text-slate-400 italic">暂无安排</p>}
                          <div className="space-y-2">
                            {day.afternoon.map(act => (
                              <div key={act.id} className="flex items-start gap-2 p-2 bg-slate-50 rounded border border-slate-100">
                                <span className={`text-xs px-2 py-1 rounded text-white mt-1 ${act.type === 'visit' ? 'bg-indigo-500' : 'bg-emerald-500'}`}>
                                  {act.type === 'visit' ? '参访' : '授课'}
                                </span>
                                  <div className="flex-1 space-y-3">
                                    {/* 第一行：老师，按小时/半天/全天，（课时），课时费 */}
                                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-center">
                                      <select 
                                        value={act.supplierId} 
                                        onChange={(e) => updateActivity(dayIndex, 'afternoon', act.id, 'supplierId', e.target.value)}
                                        className="w-full rounded border-slate-300 text-xs py-1 focus:border-indigo-500 focus:ring-indigo-500"
                                      >
                                        <option value="">选择{act.type === 'visit' ? '参访点' : '讲师'}</option>
                                        {suppliers.filter(s => s.type === (act.type === 'visit' ? '参访点' : '老师')).map(s => (
                                          <option key={s.id} value={s.id}>{s.name}</option>
                                        ))}
                                      </select>
                                      
                                      {act.type === 'teach' && (
                                        <>
                                          <select
                                            value={act.billingType || 'hour'}
                                            onChange={(e) => updateActivity(dayIndex, 'afternoon', act.id, 'billingType', e.target.value)}
                                            className="text-xs border-slate-300 rounded-md py-1"
                                          >
                                            <option value="hour">按小时</option>
                                            <option value="half_day">按半天</option>
                                            <option value="day">按全天</option>
                                          </select>
                                          
                                          {(act.billingType === 'hour' || !act.billingType) ? (
                                            <div className="flex items-center space-x-1">
                                              <input
                                                type="number"
                                                value={act.hours || 0}
                                                onChange={(e) => updateActivity(dayIndex, 'afternoon', act.id, 'hours', Number(e.target.value))}
                                                className="w-12 text-xs border-slate-300 rounded-md px-1 py-1"
                                              />
                                              <span className="text-xs text-slate-500">小时</span>
                                            </div>
                                          ) : <div />}
                                          
                                          <div className="flex items-center space-x-2 bg-white p-1 rounded border border-slate-200">
                                            <span className="text-xs text-slate-500 whitespace-nowrap">课时参考价格:</span>
                                            <input
                                              type="number"
                                              value={act.cost}
                                              onChange={(e) => updateActivity(dayIndex, 'afternoon', act.id, 'cost', parseFloat(e.target.value) || 0)}
                                              className="w-full rounded border-transparent text-xs py-1 focus:border-indigo-500 focus:ring-0 text-right"
                                            />
                                          </div>
                                        </>
                                      )}
                                      
                                      {act.type === 'visit' && (
                                        <div className="flex items-center space-x-2 sm:col-span-3 bg-white p-1 rounded border border-slate-200">
                                          <span className="text-xs text-slate-500 whitespace-nowrap">参考价格:</span>
                                          <input
                                            type="number"
                                            value={act.cost}
                                            onChange={(e) => updateActivity(dayIndex, 'afternoon', act.id, 'cost', parseFloat(e.target.value) || 0)}
                                            className="w-full rounded border-transparent text-xs py-1 focus:border-indigo-500 focus:ring-0 text-right"
                                          />
                                        </div>
                                      )}
                                    </div>

                                    {/* 第二行：课程名称，语言 */}
                                    {act.type === 'teach' && (
                                      <div className="grid grid-cols-2 gap-2">
                                        <input 
                                          type="text" 
                                          placeholder="课程名称" 
                                          value={act.courseName || ''} 
                                          onChange={(e) => updateActivity(dayIndex, 'afternoon', act.id, 'courseName', e.target.value)} 
                                          className="w-full rounded border-slate-300 text-xs py-1 focus:border-indigo-500 focus:ring-indigo-500" 
                                        />
                                        <select 
                                          value={act.language || ''} 
                                          onChange={(e) => updateActivity(dayIndex, 'afternoon', act.id, 'language', e.target.value)} 
                                          className="w-full rounded border-slate-300 text-xs py-1 focus:border-indigo-500 focus:ring-indigo-500"
                                        >
                                          <option value="">选择语言</option>
                                          <option value="中文">中文</option>
                                          <option value="英文">英文</option>
                                          <option value="日文">日文</option>
                                          <option value="其他">其他</option>
                                        </select>
                                      </div>
                                    )}

                                    {/* 第三行：场地，按小时/半天/全天，场地费 */}
                                    {act.type === 'teach' && (
                                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-center">
                                        <select 
                                          value={act.venueId || ''} 
                                          onChange={(e) => updateActivity(dayIndex, 'afternoon', act.id, 'venueId', e.target.value)} 
                                          className="w-full rounded border-slate-300 text-xs py-1 focus:border-indigo-500 focus:ring-indigo-500"
                                        >
                                          <option value="">选择场地</option>
                                          {suppliers.filter(s => s.type === '场地').map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                        </select>
                                        
                                        <select
                                          value={act.venueBillingType || 'hour'}
                                          onChange={(e) => updateActivity(dayIndex, 'afternoon', act.id, 'venueBillingType', e.target.value)}
                                          className="text-xs border-slate-300 rounded-md py-1"
                                        >
                                          <option value="hour">按小时</option>
                                          <option value="half_day">按半天</option>
                                          <option value="day">按全天</option>
                                        </select>
                                        
                                        {(act.venueBillingType === 'hour' || !act.venueBillingType) ? (
                                          <div className="flex items-center space-x-1">
                                            <input
                                              type="number"
                                              value={act.venueHours || 0}
                                              onChange={(e) => updateActivity(dayIndex, 'afternoon', act.id, 'venueHours', Number(e.target.value))}
                                              className="w-12 text-xs border-slate-300 rounded-md px-1 py-1"
                                            />
                                            <span className="text-xs text-slate-500">小时</span>
                                          </div>
                                        ) : <div />}
                                        
                                        <div className="flex items-center space-x-2 bg-white p-1 rounded border border-slate-200">
                                          <span className="text-xs text-slate-500 whitespace-nowrap">场地参考价格:</span>
                                          <input
                                            type="number"
                                            value={act.venueCost || 0}
                                            onChange={(e) => updateActivity(dayIndex, 'afternoon', act.id, 'venueCost', parseFloat(e.target.value) || 0)}
                                            className="w-full rounded border-transparent text-xs py-1 focus:border-indigo-500 focus:ring-0 text-right"
                                          />
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                <button type="button" onClick={() => removeActivity(dayIndex, 'afternoon', act.id)} className="text-slate-400 hover:text-red-500 p-1"><Trash2 className="w-4 h-4" /></button>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Evening */}
                        <div className="flex items-center gap-2 bg-blue-50 p-2 rounded border border-blue-100">
                          <span className="text-xs font-medium text-blue-800 w-16">晚餐</span>
                          <select 
                            value={day.evening.supplierId} 
                            onChange={(e) => updateMeal(dayIndex, 'evening', 'supplierId', e.target.value)}
                            className="flex-1 rounded border-blue-200 text-xs py-1 focus:border-blue-500 focus:ring-blue-500 bg-white"
                          >
                            <option value="">选择餐饮</option>
                            {suppliers.filter(s => s.type === '餐饮').map(s => (
                              <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                          </select>
                          <div className="flex items-center space-x-2 w-32 bg-white p-1 rounded border border-blue-200">
                            <span className="text-xs text-blue-800 whitespace-nowrap">参考价格:</span>
                            <input
                              type="number"
                              value={day.evening.cost}
                              onChange={(e) => updateMeal(dayIndex, 'evening', 'cost', parseFloat(e.target.value) || 0)}
                              className="w-full rounded border-transparent text-xs py-1 focus:border-blue-500 focus:ring-0 text-right"
                            />
                          </div>
                        </div>

                      </div>
                    </div>
                  ))}
                </div>

                <div className="lg:col-span-1">
                  <div className="sticky top-6 space-y-6">
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                      <h4 className="font-semibold text-slate-900 mb-6 flex items-center">
                        <Calculator className="w-5 h-5 mr-2 text-indigo-500" />
                        参考价格与上浮核算
                      </h4>
                      {(() => {
                        const costs = calculateCosts();
                        return (
                          <div className="space-y-6">
                            <div className="grid grid-cols-2 gap-4">
                              <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                                <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1 font-semibold">总参考价格</p>
                                <p className="text-lg font-bold text-slate-900">¥{costs.totalCost.toLocaleString()}</p>
                              </div>
                              <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                                <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1 font-semibold">总预算</p>
                                <p className="text-lg font-bold text-slate-900">¥{costs.totalBudget.toLocaleString()}</p>
                              </div>
                              <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                                <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1 font-semibold">参考价上浮</p>
                                <p className={`text-lg font-bold ${costs.profit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                  ¥{costs.profit.toLocaleString()}
                                </p>
                              </div>
                              <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                                <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1 font-semibold">上浮率</p>
                                <p className={`text-lg font-bold ${costs.profitMargin >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                  {costs.profitMargin.toFixed(2)}%
                                </p>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4 pt-6 border-t border-slate-200">
                              <div>
                                <label className="block text-xs font-medium text-slate-500 mb-1.5">人均报价 (¥)</label>
                                <div className="relative">
                                  <input 
                                    type="number" 
                                    {...register('quotedPricePerPerson')} 
                                    onChange={(e) => {
                                      const val = Number(e.target.value);
                                      setValue('quotedPricePerPerson', val);
                                      setValue('quotedTotalPrice', val * (getValues('participants') || 0));
                                    }}
                                    className="w-full rounded-md border-slate-300 pl-7 pr-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" 
                                  />
                                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">¥</span>
                                </div>
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-slate-500 mb-1.5">报价总额 (¥)</label>
                                <div className="relative">
                                  <input 
                                    type="number" 
                                    {...register('quotedTotalPrice')} 
                                    onChange={(e) => {
                                      const val = Number(e.target.value);
                                      setValue('quotedTotalPrice', val);
                                      const p = getValues('participants') || 1;
                                      setValue('quotedPricePerPerson', Math.round(val / p));
                                    }}
                                    className="w-full rounded-md border-slate-300 pl-7 pr-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" 
                                  />
                                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">¥</span>
                                </div>
                              </div>
                            </div>

                              <div className="grid grid-cols-1 gap-3 pt-2">
                                <button
                                  onClick={saveQuotation}
                                  className="w-full bg-white border border-slate-300 text-slate-700 px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-slate-50 flex items-center justify-center transition-colors shadow-sm"
                                >
                                  <Save className="w-4 h-4 mr-2" />
                                  保存报价单
                                </button>
                                <button
                                  onClick={generateManualProposal}
                                  disabled={isGeneratingManual}
                                  className="w-full bg-indigo-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-indigo-700 flex items-center justify-center disabled:opacity-50 shadow-sm transition-all"
                                >
                                  {isGeneratingManual ? (
                                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> 生成中...</>
                                  ) : (
                                    <><Sparkles className="w-4 h-4 mr-2" /> 生成客户方案</>
                                  )}
                                </button>
                              </div>
                            </div>
                          );
                        })()}
                      </div>

                    {manualProposal && (
                      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                        <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-4">
                          <h3 className="text-lg font-semibold text-slate-900 flex items-center">
                            <FileText className="w-5 h-5 mr-2 text-indigo-500" />
                            客户报价方案
                          </h3>
                          <div className="flex flex-wrap gap-2">
                            <button 
                              onClick={() => {
                                console.log('Toggling edit mode. Current state:', isEditingProposal);
                                setIsEditingProposal(!isEditingProposal);
                              }}
                              className="px-2 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 flex items-center"
                            >
                              {isEditingProposal ? <><Check className="w-3 h-3 mr-1" /> 完成</> : <><Edit3 className="w-3 h-3 mr-1" /> 编辑</>}
                            </button>
                            <button 
                              onClick={exportToPDF}
                              className="px-2 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 flex items-center"
                            >
                              <Download className="w-3 h-3 mr-1" /> PDF
                            </button>
                            <button 
                              onClick={exportToWord}
                              className="px-2 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 flex items-center"
                            >
                              <FileText className="w-3 h-3 mr-1" /> Word
                            </button>
                            <button 
                              onClick={saveQuotation}
                              className="px-2 py-1 text-xs font-medium text-white bg-indigo-600 rounded hover:bg-indigo-700 flex items-center"
                            >
                              <Save className="w-3 h-3 mr-1" /> 存档
                            </button>
                          </div>
                        </div>

                        {manualError && (
                          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
                            {manualError}
                          </div>
                        )}

                        <div id="proposal-content" className="p-4 bg-white max-h-[400px] overflow-y-auto border border-slate-100 rounded">
                          {isEditingProposal ? (
                            <textarea
                              value={editableProposal}
                              onChange={(e) => setEditableProposal(e.target.value)}
                              className="w-full min-h-[300px] p-4 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 font-mono text-sm"
                              placeholder="在此编辑方案内容..."
                            />
                          ) : (
                            <div className="prose prose-slate max-w-none prose-headings:text-slate-900 prose-a:text-indigo-600 text-sm">
                              <Markdown>{editableProposal}</Markdown>
                            </div>
                          )}
                        </div>

                        {/* Hidden element for high-quality export - avoid Tailwind prose to prevent oklch errors */}
                        <div style={{ position: 'absolute', left: '-9999px', top: 0, width: '800px' }}>
                          <div id="proposal-export-content" style={{ padding: '40px', backgroundColor: 'white' }}>
                            <Markdown>{editableProposal}</Markdown>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
            
            {!schedule.length && (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center h-full flex flex-col items-center justify-center">
                <Calculator className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-slate-900">请先在左侧填写需求并生成行程表</h3>
                <p className="text-slate-500 mt-2">生成行程表后，您可以手动选择每天的供应商，并实时测算成本。</p>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'history' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-6 border-b border-slate-200">
            <h3 className="text-lg font-semibold text-slate-900">历史报价单</h3>
            <p className="text-sm text-slate-500 mt-1">查看您和您团队的历史报价记录。</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-600 font-medium border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3">报价单号</th>
                  <th className="px-6 py-3">项目名称</th>
                  <th className="px-6 py-3">客户名称</th>
                  <th className="px-6 py-3">报价</th>
                  <th className="px-6 py-3">参考价格</th>
                  <th className="px-6 py-3">创建时间</th>
                  <th className="px-6 py-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {loadingHistory ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-8 text-center text-slate-500">加载中...</td>
                  </tr>
                ) : historyQuotations.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-8 text-center text-slate-500">暂无历史报价记录</td>
                  </tr>
                ) : (
                  historyQuotations.map((q) => (
                    <tr key={q.id} className="hover:bg-slate-50">
                      <td className="px-6 py-4 font-mono text-xs">{q.quotation_number || '-'}</td>
                      <td className="px-6 py-4 font-medium text-slate-900">{q.name}</td>
                      <td className="px-6 py-4">{q.client_name}</td>
                      <td className="px-6 py-4">¥{q.quoted_total_price?.toLocaleString() || '-'}</td>
                      <td className="px-6 py-4">¥{q.reference_price_total?.toLocaleString() || '0'}</td>
                      <td className="px-6 py-4">{new Date(q.created_at).toLocaleString()}</td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end space-x-2">
                          <button
                            onClick={() => loadQuotation(q)}
                            className="text-slate-600 hover:text-slate-900 font-medium text-xs bg-slate-100 px-2 py-1 rounded"
                          >
                            修改
                          </button>
                          <button
                            onClick={() => {
                              loadQuotation(q);
                              setCurrentQuotationId(null);
                              setValue('quotationNumber', generateQuotationNumber());
                              alert('已复制报价单，请修改后重新存档。');
                            }}
                            className="text-slate-600 hover:text-slate-900 font-medium text-xs bg-slate-100 px-2 py-1 rounded"
                          >
                            复制
                          </button>
                          <button
                            onClick={() => createProjectFromQuotation(q)}
                            className="text-indigo-600 hover:text-indigo-900 font-medium text-xs bg-indigo-50 px-2 py-1 rounded"
                          >
                            立项
                          </button>
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (confirm('确定要删除此报价单吗？')) {
                                try {
                                  const { error } = await supabase.from('quotations').delete().eq('id', q.id);
                                  if (error) throw error;
                                  alert('删除成功');
                                  fetchHistory();
                                } catch (err) {
                                  console.error('Error deleting quotation:', err);
                                  alert('删除失败');
                                }
                              }
                            }}
                            className="text-red-600 hover:text-red-900 font-medium text-xs bg-red-50 px-2 py-1 rounded"
                          >
                            删除
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'prompt' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-6 border-b border-slate-200">
            <h3 className="text-lg font-semibold text-slate-900">提示词配置</h3>
            <p className="text-sm text-slate-500 mt-1">配置生成客户方案时使用的 AI 提示词模板。</p>
          </div>
          <div className="p-6 space-y-4">
            {loadingPrompt ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
              </div>
            ) : (
              <>
                <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                  <h4 className="text-sm font-medium text-slate-700 mb-2">默认提示词：</h4>
                  <pre className="text-xs text-slate-600 whitespace-pre-wrap font-sans">
{`你是一个专业的游学/培训项目产品经理。请根据以下客户需求和我们已经人工配置好的行程安排，自动生成一份给客户的正式项目方案。

【客户需求】
- 项目名称：{projectName}
- 客户名称：{clientName}
- 参访人数：{participants} 人
- 参访天数：{days} 天
- 报价信息：{quotedPriceInfo}

【已配置行程安排】
{hotelContext}

{scheduleContext}

【输出要求】
1. 方案概述：简述方案的整体思路和亮点。
2. 详细行程：将上述已配置的行程安排润色成适合发给客户看的详细行程描述。
3. 报价说明：请引用上述的报价信息（如果有单人报价和总价，请都列出），并说明这是一个高品质的定制方案，包含上述行程中的所有项目。请不要列出我们的成本价。

请使用 Markdown 格式输出，排版清晰美观，语言专业热情。`}
                  </pre>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    自定义提示词
                  </label>
                  <textarea
                    value={promptTemplate}
                    onChange={(e) => setPromptTemplate(e.target.value)}
                    rows={15}
                    className="w-full px-4 py-3 border border-slate-300 rounded-lg text-sm font-mono focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="输入提示词模板，使用 {projectName}, {clientName}, {participants}, {days}, {quotedPriceInfo}, {hotelContext}, {scheduleContext} 作为占位符"
                  />
                  <p className="text-xs text-slate-500 mt-2">
                    可用占位符：{`{projectName}`} - 项目名称，{`{clientName}`} - 客户名称，{`{participants}`} - 参访人数，{`{days}`} - 参访天数，
                    {`{quotedPriceInfo}`} - 报价信息，{`{hotelContext}`} - 酒店安排，{`{scheduleContext}`} - 行程安排
                  </p>
                </div>
                <div className="flex items-center space-x-2 pt-2">
                  <button
                    onClick={savePromptTemplate}
                    disabled={savingPrompt}
                    className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium disabled:opacity-50"
                  >
                    {savingPrompt ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                    保存提示词
                  </button>
                  <button
                    onClick={() => {
                      const defaultTemplate = `你是一个专业的游学/培训项目产品经理。请根据以下客户需求和我们已经人工配置好的行程安排，自动生成一份给客户的正式项目方案。

【客户需求】
- 项目名称：{projectName}
- 客户名称：{clientName}
- 参访人数：{participants} 人
- 参访天数：{days} 天
- 报价信息：{quotedPriceInfo}

【已配置行程安排】
{hotelContext}

{scheduleContext}

【输出要求】
1. 方案概述：简述方案的整体思路和亮点。
2. 详细行程：将上述已配置的行程安排润色成适合发给客户看的详细行程描述。
3. 报价说明：请引用上述的报价信息（如果有单人报价和总价，请都列出），并说明这是一个高品质的定制方案，包含上述行程中的所有项目。请不要列出我们的成本价。

请使用 Markdown 格式输出，排版清晰美观，语言专业热情。`;
                      setPromptTemplate(defaultTemplate);
                    }}
                    className="flex items-center px-4 py-2 bg-white text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors text-sm font-medium"
                  >
                    恢复默认
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
