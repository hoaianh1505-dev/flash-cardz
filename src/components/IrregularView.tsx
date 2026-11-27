'use client';

import { useMemo, useState } from 'react';
import irregularVerbs from '@/data/irregular-verbs.json';
import { capFirst, keyOf } from '@/lib/pos';
import { IconEyeOff, IconSearch, IconVolume } from './Icons';

type IrrRow = [string, string, string, string];
const IRR_ALL = irregularVerbs as IrrRow[];

const TOP_100_SET = new Set([
  'arise', 'awake', 'be', 'bear', 'beat', 'become', 'begin', 'bend', 'bet', 'bid',
  'bind', 'bite', 'bleed', 'blow', 'break', 'bring', 'broadcast', 'build', 'burn', 'burst',
  'buy', 'catch', 'choose', 'come', 'cost', 'cut', 'deal', 'dig', 'do', 'draw',
  'dream', 'drink', 'drive', 'eat', 'fall', 'feed', 'feel', 'fight', 'find', 'fit',
  'fly', 'forbid', 'forecast', 'forget', 'forgive', 'freeze', 'get', 'give', 'go', 'grow',
  'hang', 'have', 'hear', 'hide', 'hit', 'hold', 'hurt', 'keep', 'know', 'lay',
  'lead', 'learn', 'leave', 'lend', 'let', 'lie', 'light', 'lose', 'make', 'mean',
  'meet', 'overcome', 'pay', 'prove', 'put', 'quit', 'read', 'ride', 'ring', 'rise',
  'run', 'say', 'see', 'seek', 'sell', 'send', 'set', 'shake', 'shine', 'shoot',
  'show', 'shut', 'sing', 'sink', 'sit', 'sleep', 'speak', 'spend', 'stand', 'take',
]);

const IRR_TOP_100 = IRR_ALL.filter((r) => TOP_100_SET.has(r[0].toLowerCase()));

function irrPattern(r: IrrRow): 'AAA' | 'ABA' | 'ABB' | 'ABC' {
  const a = r[0];
  const b = r[1].split('/')[0];
  const c = r[2].split('/')[0];
  if (a === b && b === c) return 'AAA';
  if (a === c) return 'ABA';
  if (b === c) return 'ABB';
  return 'ABC';
}

function firstLetter(w: string): string {
  const c = String(w).trim().toLowerCase().replace(/^[^a-z0-9]+/i, '').charAt(0);
  return /[a-z]/i.test(c) ? c.toUpperCase() : '#';
}

interface Props {
  onSpeak: (text: string, slow?: boolean) => void;
}

export default function IrregularView({ onSpeak }: Props) {
  const [scope, setScope] = useState<'top100' | 'all360'>('top100');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'AAA' | 'ABA' | 'ABB' | 'ABC'>('all');
  const [hide, setHide] = useState(false);
  const [filtersCollapsed, setFiltersCollapsed] = useState(false);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});

  const dataset = scope === 'top100' ? IRR_TOP_100 : IRR_ALL;

  const patternCounts = useMemo(() => {
    const pc = { AAA: 0, ABA: 0, ABB: 0, ABC: 0 };
    dataset.forEach((r) => pc[irrPattern(r)]++);
    return pc;
  }, [dataset]);

  const filtered = useMemo(() => {
    const q = keyOf(search);
    return dataset.filter(
      (r) =>
        (filter === 'all' || irrPattern(r) === filter) &&
        (!q || r.some((x) => keyOf(x).includes(q)))
    );
  }, [dataset, search, filter]);

  const letterCounts = useMemo(() => {
    const cnt: Record<string, number> = {};
    filtered.forEach((r) => {
      const L = firstLetter(r[0]);
      cnt[L] = (cnt[L] || 0) + 1;
    });
    return cnt;
  }, [filtered]);

  const chips: [typeof filter, string, number][] = [
    ['all', 'Tất cả', dataset.length],
    ['AAA', 'V1 = V2 = V3', patternCounts.AAA],
    ['ABA', 'V1 = V3', patternCounts.ABA],
    ['ABB', 'V2 = V3', patternCounts.ABB],
    ['ABC', 'Khác nhau cả 3', patternCounts.ABC],
  ];

  function jumpLetter(L: string) {
    const el = document.getElementById(`ir-${L}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function handleCellClick(rowIdx: number, colIdx: number, row: IrrRow) {
    if (hide) {
      setRevealed((prev) => ({ ...prev, [`${rowIdx}-${colIdx}`]: true }));
    }
    if (colIdx !== 3) {
      onSpeak(row[colIdx], false);
    }
  }

  let currentLetter = '';

  return (
    <section className="pagePanel">
      <div className="libTopRow" style={{ marginBottom: filtersCollapsed ? 10 : 12 }}>
        <div className="irrScopeTabs" role="tablist" aria-label="Chọn bộ động từ">
          <button
            type="button"
            role="tab"
            aria-selected={scope === 'top100'}
            className={`irrScopeBtn ${scope === 'top100' ? 'active' : ''}`}
            onClick={() => {
              setScope('top100');
              setRevealed({});
            }}
          >
            100 từ thông dụng
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={scope === 'all360'}
            className={`irrScopeBtn ${scope === 'all360' ? 'active' : ''}`}
            onClick={() => {
              setScope('all360');
              setRevealed({});
            }}
          >
            Đầy đủ {IRR_ALL.length} từ
          </button>
        </div>

        <div className="searchFieldWrap" style={{ flex: 1, minWidth: 200 }}>
          <IconSearch size={16} className="searchFieldIcon" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm V1, V2, V3 hoặc nghĩa..."
          />
        </div>

        <button
          type="button"
          className="ghost small"
          onClick={() => setFiltersCollapsed((v) => !v)}
        >
          {filtersCollapsed ? 'Hiện bộ lọc ▼' : 'Ẩn bộ lọc ▲'}
        </button>
      </div>

      {!filtersCollapsed && (
        <>
          <div className="catChips">
            <button
              type="button"
              className={`chip btnIconText ${hide ? 'active' : ''}`}
              onClick={() => {
                setHide((h) => !h);
                setRevealed({});
              }}
            >
              <IconEyeOff size={15} />
              <span>{hide ? 'Đang che V2 · V3 · Nghĩa' : 'Che V2 · V3 · Nghĩa'}</span>
            </button>
            {chips.map(([k, label, n]) => (
              <button
                key={k}
                type="button"
                className={`chip ${filter === k ? 'active' : ''}`}
                onClick={() => setFilter(k)}
              >
                {label} <span className="chipN">{n}</span>
              </button>
            ))}
          </div>

          <div className="azBar">
            {'#ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((L) => (
              <button
                key={L}
                type="button"
                className={letterCounts[L] ? '' : 'off'}
                onClick={() => jumpLetter(L)}
              >
                {L}
              </button>
            ))}
          </div>
        </>
      )}

      <div className={`irrWrap pageIrrWrap ${filtersCollapsed ? 'expanded' : ''}`}>
        <table className={`irrTable ${hide ? 'irrHide' : ''}`}>
          <thead>
            <tr>
              <th title="Đọc cả hàng" aria-label="Đọc cả hàng">
                <IconVolume size={16} />
              </th>
              <th>V1 (Nguyên mẫu)</th>
              <th>V2 (Quá khứ)</th>
              <th>V3 (Quá khứ phân từ)</th>
              <th>Nghĩa tiếng Việt</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="empty">
                  Không tìm thấy động từ phù hợp.
                </td>
              </tr>
            ) : (
              filtered.map((r, idx) => {
                const L = firstLetter(r[0]);
                const showHeader = L !== currentLetter;
                if (showHeader) currentLetter = L;
                return (
                  <RowGroup
                    key={`${scope}-${r[0]}-${idx}`}
                    letter={showHeader ? L : null}
                    letterCount={letterCounts[L] || 0}
                    row={r}
                    idx={idx}
                    revealed={revealed}
                    onSpeakRow={() => onSpeak(`${r[0]}. ${r[1]}. ${r[2]}`, false)}
                    onCellClick={(col) => handleCellClick(idx, col, r)}
                  />
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="irrCount">
        Hiển thị {filtered.length} / {dataset.length} động từ
      </div>
    </section>
  );
}

function RowGroup({
  letter,
  letterCount,
  row,
  idx,
  revealed,
  onSpeakRow,
  onCellClick,
}: {
  letter: string | null;
  letterCount: number;
  row: IrrRow;
  idx: number;
  revealed: Record<string, boolean>;
  onSpeakRow: () => void;
  onCellClick: (col: number) => void;
}) {
  return (
    <>
      {letter && (
        <tr className="trLetter" id={`ir-${letter}`}>
          <td colSpan={5}>
            {letter}
            <small>{letterCount} động từ</small>
          </td>
        </tr>
      )}
      <tr>
        <td className="spkCell">
          <button
            type="button"
            className="spkBtn"
            onClick={onSpeakRow}
            title="Đọc cả 3 dạng V1 – V2 – V3"
            aria-label={`Đọc ${row[0]}`}
          >
            <IconVolume size={16} />
          </button>
        </td>
        <td className="cv0" onClick={() => onCellClick(0)}>
          {row[0]}
        </td>
        <td
          className={`cv ${revealed[`${idx}-1`] ? 'rev' : ''}`}
          onClick={() => onCellClick(1)}
        >
          {row[1]}
        </td>
        <td
          className={`cv ${revealed[`${idx}-2`] ? 'rev' : ''}`}
          onClick={() => onCellClick(2)}
        >
          {row[2]}
        </td>
        <td
          className={`vi cv ${revealed[`${idx}-3`] ? 'rev' : ''}`}
          onClick={() => onCellClick(3)}
        >
          {capFirst(row[3])}
        </td>
      </tr>
    </>
  );
}
