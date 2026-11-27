'use client';

import { useMemo, useState } from 'react';
import { capFirst, detectPOS, POS_LIST, PosKey } from '@/lib/pos';
import type { CardItem, StudySessionItem } from './FlashcardApp';
import { IconFlame, IconStar, IconVolume } from './Icons';

interface Props {
  cards: CardItem[];
  sessions: StudySessionItem[];
  dailyToday: number;
  streak: number;
  dailyGoal: number;
  onUpdateDailyGoal: (goal: number) => void;
  onJumpToCard: (id: string) => void;
  onSpeak: (text: string, slow?: boolean) => void;
  onGoPractice: () => void;
}

const POS_COLORS: Record<PosKey, string> = {
  n: '#1f6a5c',
  v: '#c98a2e',
  adj: '#c85a3a',
  adv: '#4b7a8c',
  phrase: '#628a58',
  prep: '#9c7848',
  conj: '#7d6b5d',
  other: '#8c9491',
};

const MODE_LABELS: Record<StudySessionItem['mode'], string> = {
  dictation: 'Nghe chép',
  quiz: 'Trắc nghiệm',
  speaking: 'Phát âm',
};

function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDuration(totalSec: number): string {
  if (totalSec <= 0) return '0 phút';
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (hrs > 0) return `${hrs}g ${mins}p`;
  if (mins > 0) return `${mins}p ${secs}s`;
  return `${secs} giây`;
}

function getToeicRank(score: number): { label: string; tone: 'teal' | 'gold' | 'muted' } {
  if (score >= 860) return { label: 'TOEIC Master', tone: 'teal' };
  if (score >= 730) return { label: 'Advanced', tone: 'teal' };
  if (score >= 580) return { label: 'Upper-Intermediate', tone: 'gold' };
  if (score >= 420) return { label: 'Intermediate', tone: 'gold' };
  return { label: 'Starter', tone: 'muted' };
}

export default function StatsDashboard({
  cards,
  sessions,
  dailyToday,
  streak,
  dailyGoal,
  onUpdateDailyGoal,
  onJumpToCard,
  onSpeak,
  onGoPractice,
}: Props) {
  const [trendFilter, setTrendFilter] = useState<'all' | 'dictation' | 'quiz' | 'speaking'>('all');
  const [hoveredSessionIdx, setHoveredSessionIdx] = useState<number | null>(null);
  const [hoveredPos, setHoveredPos] = useState<PosKey | null>(null);
  const [hoveredDay, setHoveredDay] = useState<{ date: string; label: string; count: number } | null>(
    null
  );
  const [hardFilter, setHardFilter] = useState<'all' | 'starred' | 'wrong'>('all');

  // Core metrics
  const core = useMemo(() => {
    const total = cards.length;
    const learned = cards.filter((c) => c.learned).length;
    const starred = cards.filter((c) => c.starred).length;
    const wrongCards = cards.filter((c) => (c.wrongCount || 0) > 0);
    const pct = total ? Math.round((learned / total) * 100) : 0;

    const avgAcc = sessions.length
      ? Math.round(sessions.reduce((acc, s) => acc + s.accuracy, 0) / sessions.length)
      : 0;

    // Trend delta: compare latest 5 sessions vs previous 5
    let accDelta: number | null = null;
    if (sessions.length >= 4) {
      const half = Math.min(5, Math.floor(sessions.length / 2));
      const recentAvg =
        sessions.slice(0, half).reduce((a, s) => a + s.accuracy, 0) / half;
      const olderAvg =
        sessions.slice(half, half * 2).reduce((a, s) => a + s.accuracy, 0) / half;
      accDelta = Math.round(recentAvg - olderAvg);
    }

    const totalSec = sessions.reduce((acc, s) => acc + (s.durationSec || 0), 0);
    const totalQuestions = sessions.reduce((acc, s) => acc + (s.total || 0), 0);

    // Estimated TOEIC readiness (0 - 990)
    // Weighted: 60% vocab mastery + 28% practice accuracy (or vocab baseline if no sessions) + 12% consistency
    const vocabScore = Math.min(1, learned / Math.max(1, Math.min(total, 1800)));
    const accScore = sessions.length ? avgAcc / 100 : Math.min(0.75, vocabScore * 0.9);
    const streakScore = Math.min(1, (streak * 0.12) + Math.min(1, dailyToday / Math.max(1, dailyGoal)) * 0.35);
    const estimatedToeic = Math.min(
      990,
      Math.max(150, Math.round((vocabScore * 0.62 + accScore * 0.28 + streakScore * 0.1) * 990 / 5) * 5)
    );

    const hardAll = cards
      .filter((c) => c.starred || (c.wrongCount || 0) > 0)
      .sort((a, b) => (b.wrongCount || 0) - (a.wrongCount || 0) || (b.starred ? 1 : 0) - (a.starred ? 1 : 0));

    return {
      total,
      learned,
      starred,
      wrongCount: wrongCards.length,
      pct,
      avgAcc,
      accDelta,
      totalSec,
      totalQuestions,
      estimatedToeic,
      rank: getToeicRank(estimatedToeic),
      hardAll,
    };
  }, [cards, sessions, streak, dailyToday, dailyGoal]);

  // POS Breakdown (Donut + Mastery bars)
  const posStats = useMemo(() => {
    const map = new Map<PosKey, { total: number; learned: number }>();
    POS_LIST.forEach(([k]) => map.set(k, { total: 0, learned: 0 }));

    cards.forEach((c) => {
      const tags = detectPOS(c);
      const primary: PosKey = tags[0] || 'other';
      const entry = map.get(primary) || { total: 0, learned: 0 };
      entry.total += 1;
      if (c.learned) entry.learned += 1;
      map.set(primary, entry);
    });

    const items = POS_LIST.map(([key, label]) => {
      const entry = map.get(key) || { total: 0, learned: 0 };
      return {
        key,
        label,
        color: POS_COLORS[key],
        total: entry.total,
        learned: entry.learned,
        pct: entry.total ? Math.round((entry.learned / entry.total) * 100) : 0,
      };
    })
      .filter((x) => x.total > 0)
      .sort((a, b) => b.total - a.total);

    return items;
  }, [cards]);

  // Accuracy Trend Data (chronological, up to 16 most recent)
  const trendData = useMemo(() => {
    const filtered =
      trendFilter === 'all' ? sessions : sessions.filter((s) => s.mode === trendFilter);
    return filtered.slice(0, 16).reverse();
  }, [sessions, trendFilter]);

  // 12-week (84-day) Activity Heatmap
  const heatmap = useMemo(() => {
    const counts = new Map<string, number>();

    // Count practice sessions (weighted by questions answered / 3)
    sessions.forEach((s) => {
      const d = new Date(s.createdAt);
      if (!Number.isNaN(d.getTime())) {
        const k = dateKey(d);
        counts.set(k, (counts.get(k) || 0) + Math.max(2, Math.round((s.total || 5) / 2)));
      }
    });

    // Add today's flashcard review count
    const today = new Date();
    const todayK = dateKey(today);
    if (dailyToday > 0) {
      counts.set(todayK, (counts.get(todayK) || 0) + dailyToday);
    }

    // Backfill streak days smoothly if no sessions were logged on those days
    for (let i = 1; i < Math.min(streak, 84); i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const k = dateKey(d);
      if (!counts.has(k)) {
        counts.set(k, Math.max(4, Math.round(dailyGoal * 0.6)));
      }
    }

    // Build 12 weeks ending at the end of current week (Sunday)
    const end = new Date(today);
    const dayOfWeek = (end.getDay() + 6) % 7; // Mon=0 ... Sun=6
    const start = new Date(end);
    start.setDate(end.getDate() - dayOfWeek - 11 * 7);

    const weeks: { date: string; label: string; count: number; level: number; future: boolean }[][] =
      [];
    let maxVal = 1;
    counts.forEach((v) => {
      if (v > maxVal) maxVal = v;
    });

    let activeDays = 0;
    const cursor = new Date(start);
    for (let w = 0; w < 12; w++) {
      const col: { date: string; label: string; count: number; level: number; future: boolean }[] =
        [];
      for (let d = 0; d < 7; d++) {
        const k = dateKey(cursor);
        const isFuture = cursor > today && k !== todayK;
        const val = isFuture ? 0 : counts.get(k) || 0;
        if (val > 0) activeDays++;
        const ratio = val / maxVal;
        const level =
          val === 0 ? 0 : ratio >= 0.75 ? 4 : ratio >= 0.45 ? 3 : ratio >= 0.2 ? 2 : 1;
        col.push({
          date: k,
          label: cursor.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }),
          count: val,
          level,
          future: isFuture,
        });
        cursor.setDate(cursor.getDate() + 1);
      }
      weeks.push(col);
    }

    return { weeks, activeDays };
  }, [sessions, dailyToday, streak, dailyGoal]);

  // 5-Axis Skill Radar Profile
  const radarMetrics = useMemo(() => {
    const modeAvg = (m: StudySessionItem['mode']) => {
      const list = sessions.filter((s) => s.mode === m);
      if (!list.length) return 0;
      return Math.round(list.reduce((a, s) => a + s.accuracy, 0) / list.length);
    };

    const consistency = Math.min(
      100,
      Math.round(
        Math.min(1, dailyToday / Math.max(1, dailyGoal)) * 55 + Math.min(1, streak / 7) * 45
      )
    );

    return [
      { label: 'Từ vựng', value: core.pct },
      { label: 'Nghe chép', value: modeAvg('dictation') },
      { label: 'Trắc nghiệm', value: modeAvg('quiz') },
      { label: 'Phát âm', value: modeAvg('speaking') },
      { label: 'Chuyên cần', value: consistency },
    ];
  }, [core.pct, sessions, dailyToday, dailyGoal, streak]);

  // Filtered Hard Words
  const visibleHardCards = useMemo(() => {
    if (hardFilter === 'starred') return core.hardAll.filter((c) => c.starred).slice(0, 24);
    if (hardFilter === 'wrong') return core.hardAll.filter((c) => (c.wrongCount || 0) > 0).slice(0, 24);
    return core.hardAll.slice(0, 24);
  }, [core.hardAll, hardFilter]);

  // SVG Gauge Geometry
  const gaugePct = Math.min(1, core.estimatedToeic / 990);
  const gaugeRadius = 78;
  const gaugeArcLen = Math.PI * gaugeRadius;
  const gaugeDashOffset = gaugeArcLen * (1 - gaugePct);

  // SVG Donut Geometry
  const donutRadius = 62;
  const donutCircumference = 2 * Math.PI * donutRadius;
  const donutSegments = useMemo(() => {
    const total = Math.max(1, core.total);
    let offset = 0;
    return posStats.map((item) => {
      const len = (item.total / total) * donutCircumference;
      const seg = { ...item, len, offset };
      offset += len;
      return seg;
    });
  }, [posStats, core.total, donutCircumference]);

  const activeDonutItem = hoveredPos
    ? posStats.find((p) => p.key === hoveredPos) || null
    : null;

  // SVG Area Trend Chart Geometry
  const chartW = 540;
  const chartH = 200;
  const padL = 36;
  const padR = 18;
  const padT = 18;
  const padB = 28;
  const plotW = chartW - padL - padR;
  const plotH = chartH - padT - padB;

  const trendPoints = useMemo(() => {
    if (!trendData.length) return [];
    return trendData.map((s, i) => {
      const x =
        trendData.length === 1
          ? padL + plotW / 2
          : padL + (i / (trendData.length - 1)) * plotW;
      const y = padT + plotH - (Math.max(0, Math.min(100, s.accuracy)) / 100) * plotH;
      return { x, y, session: s, idx: i };
    });
  }, [trendData, plotW, plotH]);

  const trendPath = useMemo(() => {
    if (trendPoints.length < 2) return '';
    let d = `M ${trendPoints[0].x.toFixed(1)} ${trendPoints[0].y.toFixed(1)}`;
    for (let i = 1; i < trendPoints.length; i++) {
      const prev = trendPoints[i - 1];
      const curr = trendPoints[i];
      const cx = ((prev.x + curr.x) / 2).toFixed(1);
      d += ` C ${cx} ${prev.y.toFixed(1)}, ${cx} ${curr.y.toFixed(1)}, ${curr.x.toFixed(1)} ${curr.y.toFixed(1)}`;
    }
    return d;
  }, [trendPoints]);

  const trendAreaPath = useMemo(() => {
    if (!trendPath || trendPoints.length < 2) return '';
    const last = trendPoints[trendPoints.length - 1];
    const first = trendPoints[0];
    const baseY = (padT + plotH).toFixed(1);
    return `${trendPath} L ${last.x.toFixed(1)} ${baseY} L ${first.x.toFixed(1)} ${baseY} Z`;
  }, [trendPath, trendPoints, plotH]);

  const hoveredSession =
    hoveredSessionIdx !== null && trendPoints[hoveredSessionIdx]
      ? trendPoints[hoveredSessionIdx].session
      : trendPoints.length
        ? trendPoints[trendPoints.length - 1].session
        : null;

  // SVG Radar Geometry
  const radarCx = 130;
  const radarCy = 122;
  const radarR = 78;
  const radarPoint = (axisIdx: number, pctVal: number) => {
    const angle = -Math.PI / 2 + (axisIdx * 2 * Math.PI) / 5;
    const r = (Math.max(4, pctVal) / 100) * radarR;
    return {
      x: radarCx + Math.cos(angle) * r,
      y: radarCy + Math.sin(angle) * r,
    };
  };
  const radarPolygon = radarMetrics
    .map((m, i) => {
      const p = radarPoint(i, m.value);
      return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
    })
    .join(' ');

  const goalPct = Math.min(100, Math.round((dailyToday / Math.max(1, dailyGoal)) * 100));

  return (
    <div className="dashRoot">
      {/* ===== ROW 1: HERO READINESS GAUGE + 4 EXECUTIVE KPI TILES ===== */}
      <div className="dashTopRow">
        {/* Left: TOEIC Readiness Gauge */}
        <section className="pagePanel dashHeroCard">
          <div className="dashHeroTop">
            <span className="dashEyebrow">CHỈ SỐ SẴN SÀNG TOEIC</span>
            <span className={`dashRankBadge ${core.rank.tone}`}>{core.rank.label}</span>
          </div>

          <div className="dashGaugeWrap">
            <svg viewBox="0 0 200 116" className="dashGaugeSvg" aria-label="Điểm TOEIC ước tính">
              <defs>
                <linearGradient id="toeicGaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#c98a2e" />
                  <stop offset="55%" stopColor="#2a7d6c" />
                  <stop offset="100%" stopColor="#1f6a5c" />
                </linearGradient>
              </defs>
              {/* Background Track */}
              <path
                d="M 22 100 A 78 78 0 0 1 178 100"
                fill="none"
                stroke="var(--line)"
                strokeWidth="14"
                strokeLinecap="round"
              />
              {/* Active Value Arc */}
              <path
                d="M 22 100 A 78 78 0 0 1 178 100"
                fill="none"
                stroke="url(#toeicGaugeGrad)"
                strokeWidth="14"
                strokeLinecap="round"
                strokeDasharray={gaugeArcLen}
                strokeDashoffset={gaugeDashOffset}
                className="dashGaugeArc"
              />
              <text x="100" y="76" textAnchor="middle" className="dashGaugeScore">
                {core.estimatedToeic}
              </text>
              <text x="100" y="96" textAnchor="middle" className="dashGaugeSub">
                / 990 ĐIỂM ƯỚC TÍNH
              </text>
            </svg>
          </div>

          <div className="dashHeroFoot">
            <div className="dashMiniStat">
              <span>Từ vựng</span>
              <b>{core.pct}%</b>
            </div>
            <div className="dashMiniStat">
              <span>Chính xác</span>
              <b>{sessions.length ? `${core.avgAcc}%` : '—'}</b>
            </div>
            <div className="dashMiniStat">
              <span>Chuỗi ngày</span>
              <b className="gold">{streak} ngày</b>
            </div>
          </div>
        </section>

        {/* Right: 2x2 Executive KPI Tiles */}
        <div className="dashKpiGrid">
          {/* KPI 1: Mastered */}
          <div className="dashKpiCard">
            <div className="dashKpiHead">
              <span className="kpiLabel">Tổng từ đã thuộc</span>
              <span className="dashPill teal">{core.pct}%</span>
            </div>
            <div className="dashKpiMain">
              <b className="kpiVal teal">
                {core.learned}
                <small> / {core.total}</small>
              </b>
              <svg viewBox="0 0 44 44" className="dashRingSvg" aria-hidden="true">
                <circle cx="22" cy="22" r="18" fill="none" stroke="var(--line)" strokeWidth="4.5" />
                <circle
                  cx="22"
                  cy="22"
                  r="18"
                  fill="none"
                  stroke="var(--teal)"
                  strokeWidth="4.5"
                  strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 18}
                  strokeDashoffset={2 * Math.PI * 18 * (1 - core.pct / 100)}
                  transform="rotate(-90 22 22)"
                />
              </svg>
            </div>
            <span className="kpiSub">Còn {Math.max(0, core.total - core.learned)} từ cần chinh phục</span>
          </div>

          {/* KPI 2: Daily Goal + Streak */}
          <div className="dashKpiCard">
            <div className="dashKpiHead">
              <span className="kpiLabel">Mục tiêu hôm nay</span>
              <span className="dashPill gold">
                <IconFlame size={12} /> {streak} ngày
              </span>
            </div>
            <b className="kpiVal">
              {dailyToday}
              <small> / {dailyGoal} từ</small>
            </b>
            <div className="dashBarTrack">
              <div className="dashBarFill gold" style={{ width: `${goalPct}%` }} />
            </div>
            <div className="goalPickRow">
              {([10, 20, 30, 50] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  className={`goalChip ${dailyGoal === g ? 'active' : ''}`}
                  onClick={() => onUpdateDailyGoal(g)}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          {/* KPI 3: Accuracy & Trend */}
          <div className="dashKpiCard">
            <div className="dashKpiHead">
              <span className="kpiLabel">Độ chính xác trung bình</span>
              {core.accDelta !== null && (
                <span className={`dashPill ${core.accDelta >= 0 ? 'teal' : 'coral'}`}>
                  {core.accDelta >= 0 ? `+${core.accDelta}%` : `${core.accDelta}%`}
                </span>
              )}
            </div>
            <b className="kpiVal">{sessions.length ? `${core.avgAcc}%` : '—'}</b>
            <span className="kpiSub">
              {sessions.length
                ? `${sessions.length} phiên · ${core.totalQuestions} câu đã luyện`
                : 'Chưa có phiên luyện tập nào'}
            </span>
          </div>

          {/* KPI 4: Practice Time & Focus Words */}
          <div className="dashKpiCard">
            <div className="dashKpiHead">
              <span className="kpiLabel">Thời gian &amp; Từ khó</span>
              <span className="dashPill muted">
                <IconStar size={12} filled /> {core.starred}
              </span>
            </div>
            <b className="kpiVal">{formatDuration(core.totalSec)}</b>
            <span className="kpiSub">
              {core.wrongCount} từ từng sai · {core.hardAll.length} từ cần chú ý
            </span>
          </div>
        </div>
      </div>

      {/* ===== ROW 2: ACCURACY TREND CHART + POS DONUT BREAKDOWN ===== */}
      <div className="dashChartGrid">
        {/* Left: Smooth SVG Area/Line Chart */}
        <section className="pagePanel dashPanel">
          <div className="dashPanelHead">
            <div>
              <h2 className="dashPanelTitle">Xu hướng độ chính xác</h2>
              <p className="dashPanelSub">Theo dõi phong độ qua 16 phiên luyện gần nhất</p>
            </div>
            <div className="segGroup">
              {(
                [
                  ['all', 'Tất cả'],
                  ['dictation', 'Nghe'],
                  ['quiz', 'Trắc nghiệm'],
                  ['speaking', 'Phát âm'],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  className={`segBtn ${trendFilter === k ? 'active' : ''}`}
                  onClick={() => {
                    setTrendFilter(k);
                    setHoveredSessionIdx(null);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Fixed-height Tooltip Strip (Zero Layout Shift) */}
          <div className="dashChartReadout">
            {hoveredSession ? (
              <>
                <span className={`sessionTag ${hoveredSession.mode}`}>
                  {MODE_LABELS[hoveredSession.mode]}
                </span>
                <b>{hoveredSession.accuracy}%</b>
                <span>
                  ({hoveredSession.score}/{hoveredSession.total} câu · {hoveredSession.durationSec}s)
                </span>
                <span className="dashReadoutDate">
                  {new Date(hoveredSession.createdAt).toLocaleString('vi-VN', {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </>
            ) : (
              <span>Di chuột lên từng điểm trên biểu đồ để xem chi tiết từng lượt luyện.</span>
            )}
          </div>

          <div className="dashAreaChartBox">
            {trendPoints.length >= 1 ? (
              <svg
                viewBox={`0 0 ${chartW} ${chartH}`}
                className="dashSvgChart"
                role="img"
                aria-label="Biểu đồ xu hướng độ chính xác"
              >
                <defs>
                  <linearGradient id="accAreaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--teal)" stopOpacity="0.32" />
                    <stop offset="100%" stopColor="var(--teal)" stopOpacity="0.02" />
                  </linearGradient>
                </defs>

                {/* Horizontal Grid Lines */}
                {[0, 50, 80, 100].map((v) => {
                  const y = padT + plotH - (v / 100) * plotH;
                  const isTarget = v === 80;
                  return (
                    <g key={v}>
                      <line
                        x1={padL}
                        y1={y}
                        x2={chartW - padR}
                        y2={y}
                        stroke={isTarget ? 'var(--amber)' : 'var(--line)'}
                        strokeWidth={isTarget ? '1.2' : '1'}
                        strokeDasharray={isTarget ? '4 4' : undefined}
                        opacity={isTarget ? '0.85' : '0.7'}
                      />
                      <text x={padL - 8} y={y + 4} textAnchor="end" className="dashAxisLabel">
                        {v}%
                      </text>
                    </g>
                  );
                })}

                {/* Area Fill + Smooth Line */}
                {trendAreaPath && <path d={trendAreaPath} fill="url(#accAreaGrad)" />}
                {trendPath && (
                  <path
                    d={trendPath}
                    fill="none"
                    stroke="var(--teal)"
                    strokeWidth="2.8"
                    strokeLinecap="round"
                  />
                )}

                {/* Interactive Data Nodes */}
                {trendPoints.map((pt) => {
                  const isActive =
                    hoveredSessionIdx === pt.idx ||
                    (hoveredSessionIdx === null && pt.idx === trendPoints.length - 1);
                  return (
                    <g
                      key={pt.session.id}
                      style={{ cursor: 'pointer' }}
                      onMouseEnter={() => setHoveredSessionIdx(pt.idx)}
                      onClick={() => setHoveredSessionIdx(pt.idx)}
                      onFocus={() => setHoveredSessionIdx(pt.idx)}
                    >
                      <circle cx={pt.x} cy={pt.y} r="12" fill="transparent" />
                      <circle
                        cx={pt.x}
                        cy={pt.y}
                        r={isActive ? '5.5' : '4'}
                        fill={pt.session.accuracy >= 80 ? 'var(--teal)' : 'var(--amber)'}
                        stroke="var(--card)"
                        strokeWidth="2.2"
                      />
                    </g>
                  );
                })}
              </svg>
            ) : (
              <div className="dashEmptyChart">
                <p>Chưa có dữ liệu phiên luyện tập cho bộ lọc này.</p>
                <button type="button" className="soft small" onClick={onGoPractice}>
                  Bắt đầu luyện tập ngay
                </button>
              </div>
            )}
          </div>
        </section>

        {/* Right: POS Donut + Mastery Breakdown */}
        <section className="pagePanel dashPanel">
          <div className="dashPanelHead">
            <div>
              <h2 className="dashPanelTitle">Phân bổ &amp; Độ thuộc theo Từ loại</h2>
              <p className="dashPanelSub">Di chuột vào từng nhóm để xem tỷ lệ thuộc chi tiết</p>
            </div>
          </div>

          <div className="dashDonutLayout">
            <div className="dashDonutWrap">
              <svg viewBox="0 0 164 164" className="dashDonutSvg" aria-label="Biểu đồ tròn từ loại">
                <circle
                  cx="82"
                  cy="82"
                  r={donutRadius}
                  fill="none"
                  stroke="var(--line)"
                  strokeWidth="18"
                />
                {donutSegments.map((seg) => {
                  const isDim = hoveredPos !== null && hoveredPos !== seg.key;
                  return (
                    <circle
                      key={seg.key}
                      cx="82"
                      cy="82"
                      r={donutRadius}
                      fill="none"
                      stroke={seg.color}
                      strokeWidth={hoveredPos === seg.key ? '22' : '18'}
                      strokeDasharray={`${Math.max(0, seg.len - 1.5)} ${donutCircumference}`}
                      strokeDashoffset={-seg.offset}
                      transform="rotate(-90 82 82)"
                      opacity={isDim ? 0.35 : 1}
                      style={{ transition: 'stroke-width 0.16s, opacity 0.16s', cursor: 'pointer' }}
                      onMouseEnter={() => setHoveredPos(seg.key)}
                      onMouseLeave={() => setHoveredPos(null)}
                    />
                  );
                })}
                <text x="82" y="78" textAnchor="middle" className="dashDonutBig">
                  {activeDonutItem ? `${activeDonutItem.pct}%` : core.total}
                </text>
                <text x="82" y="97" textAnchor="middle" className="dashDonutSub">
                  {activeDonutItem ? activeDonutItem.label : 'TỔNG TỪ'}
                </text>
              </svg>
            </div>

            <div className="dashPosBars">
              {posStats.slice(0, 6).map((item) => (
                <div
                  key={item.key}
                  className={`dashPosRow ${hoveredPos === item.key ? 'active' : ''}`}
                  onMouseEnter={() => setHoveredPos(item.key)}
                  onMouseLeave={() => setHoveredPos(null)}
                >
                  <div className="dashPosRowTop">
                    <span className="dashPosName">
                      <i className="dashDot" style={{ background: item.color }} />
                      {item.label}
                    </span>
                    <span className="dashPosCount">
                      <b>{item.learned}</b>/{item.total} ({item.pct}%)
                    </span>
                  </div>
                  <div className="dashPosTrack">
                    <div
                      className="dashPosFill"
                      style={{ width: `${item.pct}%`, background: item.color }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      {/* ===== ROW 3: 12-WEEK ACTIVITY HEATMAP + 5-AXIS SKILL RADAR ===== */}
      <div className="dashChartGrid">
        {/* Left: GitHub-Style Learning Heatmap */}
        <section className="pagePanel dashPanel">
          <div className="dashPanelHead">
            <div>
              <h2 className="dashPanelTitle">Bản đồ nhiệt 12 tuần gần nhất</h2>
              <p className="dashPanelSub">
                {heatmap.activeDays} ngày có hoạt động trong 84 ngày qua
              </p>
            </div>
            <div className="dashHeatReadout">
              {hoveredDay
                ? `${hoveredDay.label}: ${hoveredDay.count} lượt`
                : `Hôm nay: ${dailyToday} từ`}
            </div>
          </div>

          <div className="dashHeatmapWrap">
            <div className="dashHeatDays">
              <span>T2</span>
              <span>T4</span>
              <span>T6</span>
            </div>
            <div className="dashHeatGrid" role="grid" aria-label="Bản đồ nhiệt 12 tuần">
              {heatmap.weeks.map((week, wi) => (
                <div key={wi} className="dashHeatCol">
                  {week.map((cell) => (
                    <button
                      key={cell.date}
                      type="button"
                      disabled={cell.future}
                      className={`dashHeatCell lvl-${cell.level} ${cell.future ? 'future' : ''}`}
                      title={`${cell.label}: ${cell.count} hoạt động`}
                      onMouseEnter={() => setHoveredDay(cell)}
                      onMouseLeave={() => setHoveredDay(null)}
                      onClick={() => setHoveredDay(cell)}
                      aria-label={`${cell.label}: ${cell.count} hoạt động`}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>

          <div className="dashHeatLegend">
            <span>Ít</span>
            <i className="dashHeatCell lvl-0" />
            <i className="dashHeatCell lvl-1" />
            <i className="dashHeatCell lvl-2" />
            <i className="dashHeatCell lvl-3" />
            <i className="dashHeatCell lvl-4" />
            <span>Nhiều</span>
          </div>
        </section>

        {/* Right: 5-Axis Skill Radar Chart */}
        <section className="pagePanel dashPanel">
          <div className="dashPanelHead">
            <div>
              <h2 className="dashPanelTitle">Hồ sơ 5 kỹ năng TOEIC</h2>
              <p className="dashPanelSub">Đánh giá cân bằng giữa Từ vựng, Nghe, Phản xạ &amp; Phát âm</p>
            </div>
          </div>

          <div className="dashRadarLayout">
            <svg viewBox="0 0 260 240" className="dashRadarSvg" aria-label="Biểu đồ radar 5 kỹ năng">
              {/* Concentric Pentagon Rings */}
              {[25, 50, 75, 100].map((lvl) => {
                const pts = [0, 1, 2, 3, 4]
                  .map((i) => {
                    const p = radarPoint(i, lvl);
                    return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
                  })
                  .join(' ');
                return (
                  <polygon
                    key={lvl}
                    points={pts}
                    fill="none"
                    stroke="var(--line)"
                    strokeWidth="1"
                  />
                );
              })}

              {/* Radial Axis Spokes */}
              {radarMetrics.map((m, i) => {
                const outer = radarPoint(i, 100);
                const labelPos = radarPoint(i, 126);
                return (
                  <g key={m.label}>
                    <line
                      x1={radarCx}
                      y1={radarCy}
                      x2={outer.x}
                      y2={outer.y}
                      stroke="var(--line)"
                      strokeWidth="1"
                    />
                    <text
                      x={labelPos.x}
                      y={labelPos.y + 4}
                      textAnchor="middle"
                      className="dashRadarLabel"
                    >
                      {m.label}
                    </text>
                  </g>
                );
              })}

              {/* Data Polygon */}
              <polygon
                points={radarPolygon}
                fill="var(--teal)"
                fillOpacity="0.22"
                stroke="var(--teal)"
                strokeWidth="2.4"
                strokeLinejoin="round"
              />

              {/* Vertex Dots */}
              {radarMetrics.map((m, i) => {
                const p = radarPoint(i, m.value);
                return (
                  <circle
                    key={m.label}
                    cx={p.x}
                    cy={p.y}
                    r="4"
                    fill="var(--teal)"
                    stroke="var(--card)"
                    strokeWidth="1.8"
                  />
                );
              })}
            </svg>

            <div className="dashRadarLegend">
              {radarMetrics.map((m) => (
                <div key={m.label} className="dashRadarRow">
                  <span>{m.label}</span>
                  <b>{m.value}%</b>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      {/* ===== ROW 4: HARD WORDS + RECENT PRACTICE SESSIONS ===== */}
      <div className="statsTwoCol">
        {/* Hard / Starred Words */}
        <section className="pagePanel dashPanel">
          <div className="dashPanelHead">
            <div>
              <h2 className="dashPanelTitle">Từ cần chú ý ({core.hardAll.length})</h2>
              <p className="dashPanelSub">Bấm vào từ để nhảy thẳng sang thẻ ôn tập</p>
            </div>
            <div className="segGroup">
              {(
                [
                  ['all', 'Tất cả'],
                  ['starred', 'Gắn sao'],
                  ['wrong', 'Hay sai'],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  className={`segBtn ${hardFilter === k ? 'active' : ''}`}
                  onClick={() => setHardFilter(k)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {visibleHardCards.length === 0 ? (
            <div className="empty">
              Chưa có từ nào trong mục này. Bấm ngôi sao trên thẻ hoặc luyện tập để hệ thống tự ghi
              nhận.
            </div>
          ) : (
            <div className="statsList">
              {visibleHardCards.map((c) => (
                <div key={c.id} className="dictMissedRow">
                  <div style={{ cursor: 'pointer' }} onClick={() => onJumpToCard(c.id)}>
                    <b>
                      {capFirst(c.word)}{' '}
                      {(c.wrongCount || 0) > 0 && (
                        <small className="wrongPill">Sai {c.wrongCount} lần</small>
                      )}
                    </b>
                    <span>{c.meanings.map((m) => capFirst(m.text)).join('; ')}</span>
                  </div>
                  <button
                    type="button"
                    className="spkBig"
                    onClick={() => onSpeak(c.word, false)}
                  >
                    <IconVolume size={15} />
                    <span>Nghe</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Recent Practice Sessions */}
        <section className="pagePanel dashPanel">
          <div className="dashPanelHead">
            <div>
              <h2 className="dashPanelTitle">Lịch sử luyện tập ({sessions.length})</h2>
              <p className="dashPanelSub">Lưu tự động sau mỗi lượt Nghe, Trắc nghiệm &amp; Phát âm</p>
            </div>
          </div>

          {sessions.length === 0 ? (
            <div className="empty">
              Chưa có phiên luyện tập nào. Hãy sang mục Luyện tập hoặc Phát âm để bắt đầu!
            </div>
          ) : (
            <div className="statsList">
              {sessions.map((s) => (
                <div key={s.id} className="sessionRow">
                  <div>
                    <div className="sessionModeRow">
                      <span className={`sessionTag ${s.mode}`}>{MODE_LABELS[s.mode]}</span>
                      <span className="sessionDate">
                        {new Date(s.createdAt).toLocaleString('vi-VN', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <div className="sessionMeta">
                      Đúng <b>{s.score}/{s.total}</b> câu · {s.durationSec}s
                    </div>
                  </div>
                  <div className={`sessionAcc ${s.accuracy >= 80 ? 'ok' : ''}`}>
                    {s.accuracy}%
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
