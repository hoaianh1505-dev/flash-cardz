'use client';

import { useMemo, useState } from 'react';
import irregularVerbs from '@/data/irregular-verbs.json';
import { keyOf } from '@/lib/pos';

type IrrRow = [string, string, string, string];
const IRR = irregularVerbs as IrrRow[];

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
  onClose: () => void;
  onSpeak: (text: string, slow?: boolean) => void;
  onToast: (msg: string) => void;
}

export default function IrregularModal({ onClose, onSpeak, onToast }: Props) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'AAA' | 'ABA' | 'ABB' | 'ABC'>('all');
  const [slow, setSlow] = useState(false);
  const [hide, setHide] = useState(false);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});

  const patternCounts = useMemo(() => {
    const pc = { AAA: 0, ABA: 0, ABB: 0, ABC: 0 };
    IRR.forEach((r) => pc[irrPattern(r)]++);
    return pc;
  }, []);

  const filtered = useMemo(() => {
    const q = keyOf(search);
    return IRR.filter(
      (r) => (filter === 'all' || irrPattern(r) === filter) && (!q || r.some((x) => keyOf(x).includes(q)))
    );
  }, [search, filter]);

  const letterCounts = useMemo(() => {
    const cnt: Record<string, number> = {};
    filtered.forEach((r) => {
      const L = firstLetter(r[0]);
      cnt[L] = (cnt[L] || 0) + 1;
    });
    return cnt;
  }, [filtered]);

  const chips: [typeof filter, string, number][] = [
    ['all', 'Tất cả', IRR.length],
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
      onSpeak(row[colIdx], slow);
    }
  }

  let currentLetter = '';

  return (
    <div className="modal" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="box wide">
        <button type="button" className="closeX" onClick={onClose} aria-label="Đóng">
          ×
        </button>
        <h2>📚 {IRR.length} động từ bất quy tắc</h2>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔎 Tìm theo V1, V2, V3 hoặc nghĩa..."
        />

        <div className="catChips">
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

        <div className="irrTools">
          <button
            type="button"
            className={`chip ${slow ? 'active' : ''}`}
            onClick={() => {
              const next = !slow;
              setSlow(next);
              onToast(next ? '🐢 Đọc chậm: BẬT' : 'Đọc tốc độ thường');
            }}
          >
            🐢 Đọc chậm
          </button>
          <button
            type="button"
            className={`chip ${hide ? 'active' : ''}`}
            onClick={() => {
              setHide((h) => !h);
              setRevealed({});
            }}
          >
            🙈 Che V2 · V3 · Nghĩa để tự kiểm tra
          </button>
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

        <div className="irrWrap">
          <table className={`irrTable ${hide ? 'irrHide' : ''}`}>
            <thead>
              <tr>
                <th title="Đọc cả hàng">🔊</th>
                <th>V1</th>
                <th>V2</th>
                <th>V3</th>
                <th>Nghĩa</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="empty">
                    Không tìm thấy.
                  </td>
                </tr>
              ) : (
                filtered.map((r, idx) => {
                  const L = firstLetter(r[0]);
                  const showHeader = L !== currentLetter;
                  if (showHeader) currentLetter = L;
                  return (
                    <RowGroup
                      key={`${r[0]}-${idx}`}
                      letter={showHeader ? L : null}
                      letterCount={letterCounts[L] || 0}
                      row={r}
                      idx={idx}
                      revealed={revealed}
                      onSpeakRow={() => onSpeak(`${r[0]}. ${r[1]}. ${r[2]}`, slow)}
                      onCellClick={(col) => handleCellClick(idx, col, r)}
                    />
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="irrCount">
          {filtered.length} / {IRR.length} động từ · bấm vào từng dạng để nghe phát âm
        </div>
      </div>
    </div>
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
            title="Đọc cả hàng: V1 – V2 – V3"
            aria-label="Đọc cả hàng"
          >
            🔊
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
          {row[3]}
        </td>
      </tr>
    </>
  );
}
