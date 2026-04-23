import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Loader2, Download, X, Image as ImageIcon } from 'lucide-react';
import html2canvas from 'html2canvas';
import type { PosterData } from '../lib/poster';

interface PosterPreviewProps {
  posterData: PosterData;
  onClose: () => void;
}

// 每日渐变色方案
const DAY_GRADIENTS = [
  { start: '#6366f1', end: '#8b5cf6' },
  { start: '#3b82f6', end: '#06b6d4' },
  { start: '#10b981', end: '#34d399' },
  { start: '#f59e0b', end: '#f97316' },
  { start: '#ec4899', end: '#f43f5e' },
  { start: '#8b5cf6', end: '#a855f7' },
  { start: '#14b8a6', end: '#22d3ee' },
];

// 亮点图标
const HIGHLIGHT_ICONS = ['✨', '🎯', '🔥', '💡', '⭐', '🏆', '🚀', '💎'];

// 活动图标
const ACTIVITY_ICONS: Record<string, string> = {
  visit: '🏢',
  teach: '📚',
};
const defaultIcon = '📍';

// ─── 带跨域支持和错误回退的图片组件 ───
function PosterImage({ src, alt, size, rounded }: { src?: string; alt: string; size: number; rounded?: boolean }) {
  const [error, setError] = useState(false);
  if (!src || error) {
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: rounded ? 8 : 0,
          background: '#f1f5f9',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <ImageIcon style={{ width: size * 0.35, height: size * 0.35, color: '#cbd5e1' }} />
      </div>
    );
  }
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: rounded ? 8 : 0,
        overflow: 'hidden',
        flexShrink: 0,
        position: 'relative',
      }}
    >
      <img
        src={src}
        alt={alt}
        crossOrigin="anonymous"
        style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', top: 0, left: 0 }}
        onError={() => setError(true)}
      />
    </div>
  );
}

// ─── 大图组件（活动卡片用） ───
function PosterImageLarge({ src, alt, gradient, icon }: { src?: string; alt: string; gradient: { start: string; end: string }; icon: string }) {
  const [error, setError] = useState(false);
  if (src && !error) {
    return (
      <img
        src={src}
        alt={alt}
        crossOrigin="anonymous"
        style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', top: 0, left: 0 }}
        onError={() => setError(true)}
      />
    );
  }
  return (
    <div style={{
      width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: `linear-gradient(135deg, ${gradient.start}15, ${gradient.end}15)`,
    }}>
      <span style={{ fontSize: 40 }}>{icon}</span>
    </div>
  );
}

// ─── 等待所有图片加载完成 ───
function waitForImages(container: HTMLElement): Promise<void> {
  const images = container.querySelectorAll('img');
  const promises = Array.from(images).map((img) => {
    if (img.complete) return Promise.resolve();
    return new Promise<void>((resolve) => {
      img.onload = () => resolve();
      img.onerror = () => resolve();
    });
  });
  return Promise.all(promises).then(() => {});
}

export default function PosterPreview({ posterData, onClose }: PosterPreviewProps) {
  const posterRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState('');

  const handleDownload = useCallback(async () => {
    if (!posterRef.current) return;
    setExporting(true);
    setExportProgress('准备中...');

    try {
      // 1) 先等所有图片加载
      setExportProgress('正在加载图片...');
      await waitForImages(posterRef.current);

      // 2) 给浏览器时间完成渲染布局
      await new Promise((r) => setTimeout(r, 800));

      // 3) 执行 html2canvas（去掉 allowTaint 避免冲突）
      setExportProgress('正在生成图片...');
      const canvas = await html2canvas(posterRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#f8fafc',
        logging: false,
      });

      // 4) 导出 PNG
      setExportProgress('正在下载...');
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, 'image/png', 1.0);
      });

      if (!blob) {
        throw new Error('图片生成失败（Canvas 导出为空），请检查图片链接是否可访问');
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `营销海报-${posterData.projectName}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error: any) {
      console.error('海报导出失败:', error);
      alert(`海报导出失败：${error.message || '未知错误'}\n\n可能原因：\n1. 图片链接不可访问或存在跨域限制\n2. 请尝试将图片上传到 Supabase Storage 并设置公开访问`);
    } finally {
      setExporting(false);
      setExportProgress('');
    }
  }, [posterData.projectName]);

  const {
    projectName,
    clientName,
    participants,
    days,
    slogan,
    highlights,
    daysData,
    hotelInfo,
    restaurants,
  } = posterData;

  const totalActivities = daysData.reduce(
    (sum, d) => sum + d.morning.length + d.afternoon.length,
    0
  );

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 顶部操作栏 */}
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
          <h2 className="text-lg font-semibold text-slate-900">营销海报预览</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              disabled={exporting}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
            >
              {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {exporting ? exportProgress || '生成中...' : '下载海报'}
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-slate-500" />
            </button>
          </div>
        </div>

        {/* 海报画布区域 */}
        <div className="p-6 bg-slate-100 flex justify-center">
          <div
            ref={posterRef}
            style={{
              width: 560,
              minHeight: 1080,
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
            }}
          >
            {/* ═══════ 1. 顶部 Header ═══════ */}
            <div
              style={{
                background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 40%, #a855f7 100%)',
                padding: '44px 32px 36px',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              {/* 装饰圆 */}
              <div style={{ position: 'absolute', top: -30, right: -30, width: 160, height: 160, borderRadius: '50%', background: 'rgba(255,255,255,0.07)' }} />
              <div style={{ position: 'absolute', bottom: -50, left: -20, width: 120, height: 120, borderRadius: '50%', background: 'rgba(255,255,255,0.05)' }} />
              <div style={{ position: 'absolute', top: 40, right: 80, width: 60, height: 60, borderRadius: '50%', background: 'rgba(255,255,255,0.08)' }} />

              {/* 品牌标签 */}
              <div style={{ marginBottom: 16 }}>
                <span style={{
                  background: 'rgba(255,255,255,0.2)',
                  padding: '4px 12px',
                  borderRadius: 6,
                  fontSize: 11,
                  color: 'rgba(255,255,255,0.95)',
                  fontWeight: 600,
                  letterSpacing: 1.5,
                }}>
                  菁英探索 · 定制参访
                </span>
              </div>

              {/* 主标题 */}
              <h1 style={{
                fontSize: 30,
                fontWeight: 900,
                color: '#fff',
                margin: '0 0 6px 0',
                lineHeight: 1.25,
                textShadow: '0 2px 12px rgba(0,0,0,0.2)',
              }}>
                {clientName}参访之旅
              </h1>

              {/* 副标题 / slogan */}
              {slogan && (
                <p style={{
                  fontSize: 14,
                  color: 'rgba(255,255,255,0.85)',
                  margin: '0 0 18px 0',
                  fontStyle: 'italic',
                }}>
                  {slogan}
                </p>
              )}

              {/* 数据标签 */}
              <div style={{ display: 'flex', gap: 12 }}>
                {[
                  { label: '天数', value: `${days}天` },
                  { label: '行程', value: `${totalActivities}站` },
                  { label: '人数', value: `${participants}人` },
                ].map((item) => (
                  <div key={item.label} style={{
                    background: 'rgba(255,255,255,0.15)',
                    padding: '8px 14px',
                    borderRadius: 10,
                    minWidth: 70,
                    textAlign: 'center',
                  }}>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.65)', marginBottom: 2, textTransform: 'uppercase', letterSpacing: 0.5 }}>{item.label}</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>{item.value}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* ═══════ 2. 行程亮点 ═══════ */}
            <div style={{
              padding: '24px 28px 16px',
              background: '#fff',
              borderBottom: '1px solid #f1f5f9',
            }}>
              <div style={{
                fontSize: 13,
                fontWeight: 700,
                color: '#4f46e5',
                marginBottom: 12,
                textTransform: 'uppercase',
                letterSpacing: 1,
              }}>
                🌟 行程亮点
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(highlights.length > 0 ? highlights : ['精选优质参访点', '专业课程赋能', '全方位服务体验']).map((h, i) => (
                  <div key={i} style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 8,
                  }}>
                    <span style={{
                      fontSize: 14,
                      width: 22,
                      height: 22,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      marginTop: 1,
                    }}>
                      {HIGHLIGHT_ICONS[i % HIGHLIGHT_ICONS.length]}
                    </span>
                    <span style={{
                      fontSize: 13,
                      color: '#475569',
                      lineHeight: 1.6,
                      fontWeight: 500,
                    }}>
                      {h}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* ═══════ 3. 每日行程（核心区域） ═══════ */}
            <div style={{ padding: '20px 28px' }}>
              {daysData.map((dayData, dayIndex) => {
                const gradient = DAY_GRADIENTS[dayIndex % DAY_GRADIENTS.length];
                const allActivities = [
                  ...dayData.morning.map((h) => ({ ...h, timeLabel: 'AM', timeColor: '#f59e0b' })),
                  ...dayData.afternoon.map((h) => ({ ...h, timeLabel: 'PM', timeColor: '#6366f1' })),
                ];

                if (allActivities.length === 0) return null;

                return (
                  <div key={dayData.day} style={{ marginBottom: 24 }}>
                    {/* Day 分隔标题 */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      marginBottom: 14,
                      gap: 12,
                    }}>
                      <div style={{
                        width: 42,
                        height: 42,
                        borderRadius: 12,
                        background: `linear-gradient(135deg, ${gradient.start}, ${gradient.end})`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#fff',
                        fontWeight: 800,
                        fontSize: 18,
                        flexShrink: 0,
                        boxShadow: `0 2px 8px ${gradient.start}33`,
                      }}>
                        D{dayData.day}
                      </div>
                      <div style={{ flex: 1, height: 1, minHeight: 1, minWidth: 20, background: `linear-gradient(90deg, ${gradient.start}50, transparent)` }} />
                    </div>

                    {/* 活动卡片 */}
                    {allActivities.map((activity, idx) => {
                      const icon = ACTIVITY_ICONS[activity.type] || defaultIcon;
                      return (
                        <div key={idx} style={{
                          display: 'flex',
                          gap: 14,
                          marginBottom: 12,
                          background: '#fff',
                          borderRadius: 14,
                          border: '1px solid #f1f5f9',
                          overflow: 'hidden',
                          boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                        }}>
                          {/* 左侧图片 */}
                          <div style={{
                            width: 130,
                            height: 130,
                            flexShrink: 0,
                            position: 'relative',
                            background: '#f8fafc',
                            overflow: 'hidden',
                          }}>
                            <PosterImageLarge src={activity.imageUrl} alt={activity.name} gradient={gradient} icon={icon} />
                            {/* AM/PM 标签 */}
                            <div style={{
                              position: 'absolute',
                              top: 8,
                              left: 8,
                              background: activity.timeColor,
                              color: '#fff',
                              fontSize: 9,
                              fontWeight: 800,
                              padding: '2px 7px',
                              borderRadius: 4,
                              letterSpacing: 0.5,
                            }}>
                              {activity.timeLabel}
                            </div>
                          </div>

                          {/* 右侧文字 */}
                          <div style={{
                            flex: 1,
                            padding: '12px 14px 12px 0',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'center',
                            minWidth: 0,
                          }}>
                            {/* 名称 */}
                            <div style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                              marginBottom: 8,
                            }}>
                              <span style={{ fontSize: 16 }}>{icon}</span>
                              <span style={{
                                fontSize: 15,
                                fontWeight: 700,
                                color: '#1e293b',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}>
                                {activity.name}
                              </span>
                            </div>
                            {/* 描述 */}
                            <p style={{
                              fontSize: 12,
                              color: '#64748b',
                              margin: 0,
                              lineHeight: 1.7,
                            }}>
                              {activity.description}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            {/* ═══════ 4. 住宿 & 餐饮（底部服务信息） ═══════ */}
            {(hotelInfo || restaurants.length > 0) && (
              <div style={{
                padding: '20px 28px',
                background: 'linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)',
                borderTop: '2px solid #e2e8f0',
              }}>
                <div style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: '#475569',
                  marginBottom: 14,
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                }}>
                  🏨 住宿餐饮
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {/* 酒店 */}
                  {hotelInfo && (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      background: '#fff',
                      borderRadius: 12,
                      padding: 12,
                      border: '1px solid #e2e8f0',
                    }}>
                      <PosterImage src={hotelInfo.imageUrl} alt={hotelInfo.name} size={56} rounded />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          marginBottom: 3,
                        }}>
                          <span style={{ fontSize: 14 }}>🏨</span>
                          <span style={{
                            fontSize: 14,
                            fontWeight: 700,
                            color: '#1e293b',
                          }}>
                            {hotelInfo.name}
                          </span>
                          <span style={{
                            fontSize: 9,
                            background: '#6366f1',
                            color: '#fff',
                            padding: '1px 6px',
                            borderRadius: 4,
                            fontWeight: 600,
                          }}>
                            住宿
                          </span>
                        </div>
                        <p style={{
                          fontSize: 12,
                          color: '#64748b',
                          margin: 0,
                          lineHeight: 1.5,
                        }}>
                          {hotelInfo.description}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* 餐厅列表 */}
                  {restaurants.map((r, i) => (
                    <div key={i} style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      background: '#fff',
                      borderRadius: 12,
                      padding: 12,
                      border: '1px solid #e2e8f0',
                    }}>
                      <PosterImage src={r.imageUrl} alt={r.name} size={56} rounded />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          marginBottom: 3,
                        }}>
                          <span style={{ fontSize: 14 }}>🍽️</span>
                          <span style={{
                            fontSize: 14,
                            fontWeight: 700,
                            color: '#1e293b',
                          }}>
                            {r.name}
                          </span>
                          <span style={{
                            fontSize: 9,
                            background: '#f59e0b',
                            color: '#fff',
                            padding: '1px 6px',
                            borderRadius: 4,
                            fontWeight: 600,
                          }}>
                            餐饮
                          </span>
                        </div>
                        <p style={{
                          fontSize: 12,
                          color: '#64748b',
                          margin: 0,
                          lineHeight: 1.5,
                        }}>
                          {r.description}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ═══════ 5. 底部 Footer ═══════ */}
            <div style={{
              padding: '18px 28px',
              background: '#1e293b',
              textAlign: 'center',
            }}>
              <p style={{
                fontSize: 11,
                color: '#94a3b8',
                margin: '0 0 4px 0',
              }}>
                {projectName} · {new Date().getFullYear()}
              </p>
              <p style={{
                fontSize: 10,
                color: '#64748b',
                margin: 0,
                letterSpacing: 0.5,
              }}>
                菁英探索 PM 系统 · 让每一次参访都有价值
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
