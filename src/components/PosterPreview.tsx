import React, { useRef, useState, useCallback } from 'react';
import { Loader2, Download, X, Image as ImageIcon } from 'lucide-react';
import html2canvas from 'html2canvas';
import type { PosterData } from '../lib/poster';

interface PosterPreviewProps {
  posterData: PosterData;
  onClose: () => void;
}

// 渐变色方案 - 每天不同
const DAY_GRADIENTS = [
  { start: '#6366f1', end: '#8b5cf6' },
  { start: '#3b82f6', end: '#06b6d4' },
  { start: '#10b981', end: '#34d399' },
  { start: '#f59e0b', end: '#f97316' },
  { start: '#ec4899', end: '#f43f5e' },
  { start: '#8b5cf6', end: '#a855f7' },
  { start: '#14b8a6', end: '#22d3ee' },
];

// 占位图标颜色
const PLACEHOLDER_COLORS = ['#e0e7ff', '#c7d2fe', '#a5b4fc', '#818cf8', '#6366f1'];

// 图标映射
const ACTIVITY_ICONS: Record<string, string> = {
  visit: '🏢',
  teach: '📚',
  meal: '🍽️',
};

const defaultIcon = '📍';

export default function PosterPreview({ posterData, onClose }: PosterPreviewProps) {
  const posterRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  const handleDownload = useCallback(async () => {
    if (!posterRef.current) return;
    setExporting(true);

    try {
      const canvas = await html2canvas(posterRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#f8fafc',
        logging: false,
      });

      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `营销海报-${posterData.projectName}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 'image/png');
    } catch (error) {
      console.error('海报导出失败:', error);
    } finally {
      setExporting(false);
    }
  }, [posterData.projectName]);

  const { projectName, clientName, participants, days, daysData, slogan } = posterData;

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
              {exporting ? '生成中...' : '下载海报'}
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-slate-500" />
            </button>
          </div>
        </div>

        {/* 海报画布 */}
        <div className="p-6 bg-slate-100 flex justify-center">
          <div
            ref={posterRef}
            style={{
              width: 540,
              minHeight: 960,
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            }}
            className="bg-white overflow-hidden relative"
          >
            {/* ===== 顶部 Header ===== */}
            <div
              style={{
                background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #a855f7 100%)',
                padding: '48px 36px 40px',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              {/* 装饰背景 */}
              <div
                style={{
                  position: 'absolute',
                  top: -40,
                  right: -40,
                  width: 180,
                  height: 180,
                  borderRadius: '50%',
                  background: 'rgba(255,255,255,0.08)',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  bottom: -60,
                  left: -30,
                  width: 140,
                  height: 140,
                  borderRadius: '50%',
                  background: 'rgba(255,255,255,0.05)',
                }}
              />

              {/* 品牌标识 */}
              <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  background: 'rgba(255,255,255,0.2)',
                  padding: '4px 12px',
                  borderRadius: 6,
                  fontSize: 12,
                  color: 'rgba(255,255,255,0.9)',
                  fontWeight: 600,
                  letterSpacing: 1,
                }}>
                  菁英探索 · 定制参访
                </span>
              </div>

              {/* 主标题 */}
              <h1 style={{
                fontSize: 28,
                fontWeight: 800,
                color: '#fff',
                margin: '0 0 8px 0',
                lineHeight: 1.3,
                textShadow: '0 2px 8px rgba(0,0,0,0.15)',
              }}>
                {clientName}参访之旅
              </h1>

              {/* 副标题 */}
              <p style={{
                fontSize: 15,
                color: 'rgba(255,255,255,0.85)',
                margin: '0 0 20px 0',
                fontStyle: 'italic',
              }}>
                {slogan || `${projectName} · 探索与成长`}
              </p>

              {/* 数据标签 */}
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                {[
                  { label: '天数', value: `${days}天` },
                  { label: '人数', value: `${participants}人` },
                  { label: '项目', value: projectName },
                ].map((item) => (
                  <div key={item.label} style={{
                    background: 'rgba(255,255,255,0.15)',
                    backdropFilter: 'blur(10px)',
                    padding: '8px 16px',
                    borderRadius: 10,
                    minWidth: 80,
                  }}>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', marginBottom: 2 }}>{item.label}</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>{item.value}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* ===== 每日行程卡片 ===== */}
            <div style={{ padding: '32px 28px' }}>
              {daysData.map((dayData, dayIndex) => {
                const gradient = DAY_GRADIENTS[dayIndex % DAY_GRADIENTS.length];
                const allHighlights = [
                  ...dayData.morningHighlights.map((h, i) => ({ ...h, timeLabel: 'AM', timeColor: '#f59e0b' })),
                  ...dayData.afternoonHighlights.map((h, i) => ({ ...h, timeLabel: 'PM', timeColor: '#6366f1' })),
                ];

                return (
                  <div key={dayData.day} style={{ marginBottom: 28 }}>
                    {/* Day 标题 */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      marginBottom: 16,
                      gap: 12,
                    }}>
                      <div style={{
                        width: 48,
                        height: 48,
                        borderRadius: 12,
                        background: `linear-gradient(135deg, ${gradient.start}, ${gradient.end})`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#fff',
                        fontWeight: 800,
                        fontSize: 20,
                        flexShrink: 0,
                      }}>
                        {dayData.day}
                      </div>
                      <div style={{ flex: 1, height: 2, background: `linear-gradient(90deg, ${gradient.start}40, transparent)` }} />
                    </div>

                    {/* 活动卡片列表 */}
                    {allHighlights.length === 0 ? (
                      <div style={{
                        padding: '20px 24px',
                        background: '#f8fafc',
                        borderRadius: 12,
                        border: '1px dashed #cbd5e1',
                        fontSize: 14,
                        color: '#94a3b8',
                        textAlign: 'center',
                      }}>
                        当日暂无行程安排
                      </div>
                    ) : (
                      allHighlights.map((highlight, idx) => {
                        const icon = ACTIVITY_ICONS[highlight.type] || defaultIcon;
                        const placeholderColor = PLACEHOLDER_COLORS[(dayIndex + idx) % PLACEHOLDER_COLORS.length];

                        return (
                          <div key={idx} style={{
                            display: 'flex',
                            gap: 16,
                            marginBottom: 14,
                            background: '#fff',
                            borderRadius: 14,
                            border: '1px solid #f1f5f9',
                            overflow: 'hidden',
                            boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                          }}>
                            {/* 左侧图片区 */}
                            <div style={{
                              width: 120,
                              height: 100,
                              flexShrink: 0,
                              position: 'relative',
                              background: `linear-gradient(135deg, ${placeholderColor}, ${placeholderColor}80)`,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}>
                              {highlight.imageUrl ? (
                                <img
                                  src={highlight.imageUrl}
                                  alt={highlight.name}
                                  style={{
                                    width: '100%',
                                    height: '100%',
                                    objectFit: 'cover',
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                  }}
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).style.display = 'none';
                                  }}
                                />
                              ) : (
                                <ImageIcon style={{ width: 28, height: 28, color: placeholderColor.replace('ff', '99') }} />
                              )}
                              {/* 时间标签 */}
                              <div style={{
                                position: 'absolute',
                                top: 6,
                                left: 6,
                                background: highlight.timeColor,
                                color: '#fff',
                                fontSize: 9,
                                fontWeight: 700,
                                padding: '2px 6px',
                                borderRadius: 4,
                                letterSpacing: 0.5,
                              }}>
                                {highlight.timeLabel}
                              </div>
                            </div>

                            {/* 右侧文字区 */}
                            <div style={{
                              flex: 1,
                              padding: '14px 16px 14px 0',
                              display: 'flex',
                              flexDirection: 'column',
                              justifyContent: 'center',
                              minWidth: 0,
                            }}>
                              {/* 图标 + 名称 */}
                              <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                marginBottom: 6,
                              }}>
                                <span style={{ fontSize: 18, lineHeight: 1 }}>{icon}</span>
                                <span style={{
                                  fontSize: 15,
                                  fontWeight: 700,
                                  color: '#1e293b',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}>
                                  {highlight.name}
                                </span>
                              </div>
                              {/* 描述 */}
                              <p style={{
                                fontSize: 13,
                                color: '#64748b',
                                margin: 0,
                                lineHeight: 1.5,
                              }}>
                                {highlight.description}
                              </p>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                );
              })}
            </div>

            {/* ===== 底部 Footer ===== */}
            <div style={{
              padding: '24px 28px',
              background: 'linear-gradient(135deg, #f8fafc, #f1f5f9)',
              borderTop: '1px solid #e2e8f0',
              textAlign: 'center',
            }}>
              <p style={{
                fontSize: 12,
                color: '#94a3b8',
                margin: '0 0 6px 0',
              }}>
                {projectName} · {new Date().getFullYear()}
              </p>
              <p style={{
                fontSize: 11,
                color: '#cbd5e1',
                margin: 0,
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
