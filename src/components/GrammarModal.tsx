'use client';

import { useState } from 'react';
import { IconBook, IconVolume, IconX } from './Icons';

interface Props {
  onClose: () => void;
  onSpeak: (text: string) => void;
}

const TENSES = [
  { name: 'Hiện tại đơn', formula: 'S + V(s/es)', signal: 'always, usually, often, every day, regularly', example: 'The company ships orders every Monday.' },
  { name: 'Hiện tại tiếp diễn', formula: 'S + am/is/are + V-ing', signal: 'now, at the moment, currently, right now', example: 'We are currently reviewing your application.' },
  { name: 'Hiện tại hoàn thành', formula: 'S + have/has + V3/ed', signal: 'since, for, already, yet, recently, so far', example: 'Sales have increased by 20% since January.' },
  { name: 'HT hoàn thành tiếp diễn', formula: 'S + have/has + been + V-ing', signal: 'for, since, all day, how long', example: 'She has been working here for five years.' },
  { name: 'Quá khứ đơn', formula: 'S + V2/ed', signal: 'yesterday, last week, ago, in 2022', example: 'The board approved the budget yesterday.' },
  { name: 'Quá khứ tiếp diễn', formula: 'S + was/were + V-ing', signal: 'at 8pm yesterday, while, when', example: 'They were discussing the contract when I called.' },
  { name: 'Quá khứ hoàn thành', formula: 'S + had + V3/ed', signal: 'before, after, by the time, prior to', example: 'He had finished the report before the meeting.' },
  { name: 'QK hoàn thành tiếp diễn', formula: 'S + had + been + V-ing', signal: 'for + khoảng thời gian + before QKĐ', example: 'They had been negotiating for hours before signing.' },
  { name: 'Tương lai đơn', formula: 'S + will + V0', signal: 'tomorrow, next month, soon, expect', example: 'The new branch will open next month.' },
  { name: 'Tương lai tiếp diễn', formula: 'S + will + be + V-ing', signal: 'at this time tomorrow, at 9am next Monday', example: 'We will be attending the seminar at 10am.' },
  { name: 'Tương lai hoàn thành', formula: 'S + will + have + V3/ed', signal: 'by + mốc thời gian tương lai, by the end of', example: 'We will have completed the project by Friday.' },
  { name: 'Tương lai gần', formula: 'S + am/is/are + going to + V0', signal: 'kế hoạch có sẵn, dấu hiệu rõ ràng', example: 'The team is going to launch a new app.' },
];

const WORD_FORMS = [
  {
    pos: 'Danh từ (Noun)',
    suffixes: '-tion / -sion, -ment, -ity, -ness, -ance / -ence, -ship, -er / -or / -ist',
    positions: 'Sau mạo từ (a/an/the), tính từ sở hữu (my/their), tính từ, giới từ, hoặc làm chủ ngữ / tân ngữ.',
    examples: ['application', 'management', 'productivity', 'applicant'],
  },
  {
    pos: 'Động từ (Verb)',
    suffixes: '-ize / -ise, -ate, -ify, -en',
    positions: 'Đứng sau chủ ngữ, sau trạng từ tần suất, sau trợ động từ (will, can, should, must, to + V0).',
    examples: ['authorize', 'evaluate', 'simplify', 'broaden'],
  },
  {
    pos: 'Tính từ (Adjective)',
    suffixes: '-ive, -al, -ful, -less, -ous, -able / -ible, -ic, -ent / -ant',
    positions: 'Đứng trước danh từ (adj + N), sau động từ nối (be, become, seem, feel, remain, look).',
    examples: ['competitive', 'financial', 'affordable', 'reliable'],
  },
  {
    pos: 'Trạng từ (Adverb)',
    suffixes: 'Adj + -ly (trừ các tính từ: friendly, timely, costly, likely, daily, monthly)',
    positions: 'Bổ nghĩa cho động từ (V + adv), tính từ (adv + adj), trạng từ khác hoặc cả câu (đầu câu, trước dấu phẩy).',
    examples: ['significantly', 'promptly', 'effectively', 'consistently'],
  },
];

const CONNECTORS = [
  { group: 'Nhượng bộ (Mặc dù)', clause: 'Although / Even though / Though + S + V', phrase: 'Despite / In spite of + N / V-ing', tip: 'TOEIC Part 5 cực hay bẫy 2 nhóm này!' },
  { group: 'Nguyên nhân (Bởi vì)', clause: 'Because / Since / As / Now that + S + V', phrase: 'Because of / Due to / Owing to + N / V-ing', tip: 'Nhìn phía sau chỗ trống có động từ chia thì hay không.' },
  { group: 'Thời gian (Trong khi)', clause: 'While / When / As soon as + S + V', phrase: 'During / Prior to / Following + N', tip: 'During luôn đi với Danh từ, không đi với mệnh đề.' },
  { group: 'Bổ sung (Ngoài ra)', clause: 'Moreover / Furthermore / In addition, S + V', phrase: 'In addition to / Besides / Aside from + N / V-ing', tip: 'Có "to" (In addition to) thì cộng Danh từ / V-ing.' },
  { group: 'Điều kiện (Miễn là / Nếu)', clause: 'If / Unless / Provided that / As long as + S + V', phrase: 'In case of / Without + N', tip: 'Unless = If ... not (không dùng phủ định phía sau).' },
  { group: 'Giới từ thời gian', clause: 'AT + giờ (at 9am) · ON + ngày/thứ (on Monday, on May 5)', phrase: 'IN + tháng/năm/mùa (in July, in 2026) · BY + hạn chót', tip: 'Within + khoảng thời gian (within 3 days).' },
];

const IPA_GROUPS = [
  {
    title: 'Nguyên âm đơn (Monophthongs)',
    items: [
      ['/iː/', 'meet'], ['/ɪ/', 'ship'], ['/ʊ/', 'book'], ['/uː/', 'tool'],
      ['/e/', 'check'], ['/ə/', 'about'], ['/ɜː/', 'work'], ['/ɔː/', 'order'],
      ['/æ/', 'plan'], ['/ʌ/', 'budget'], ['/ɑː/', 'charge'], ['/ɒ/', 'cost'],
    ],
  },
  {
    title: 'Nguyên âm đôi (Diphthongs)',
    items: [
      ['/ɪə/', 'clear'], ['/eɪ/', 'pay'], ['/ʊə/', 'tour'], ['/ɔɪ/', 'join'],
      ['/əʊ/', 'goal'], ['/eə/', 'fair'], ['/aɪ/', 'price'], ['/aʊ/', 'account'],
    ],
  },
  {
    title: 'Phụ âm hay nhầm (Key Consonants)',
    items: [
      ['/θ/', 'thorough'], ['/ð/', 'therefore'], ['/ʃ/', 'shipment'], ['/ʒ/', 'decision'],
      ['/tʃ/', 'purchase'], ['/dʒ/', 'budget'], ['/ŋ/', 'meeting'], ['/r/', 'report'],
    ],
  },
];

export default function GrammarModal({ onClose, onSpeak }: Props) {
  const [tab, setTab] = useState<'tenses' | 'wordform' | 'connectors' | 'ipa'>('tenses');

  return (
    <div className="modal" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="box wide">
        <button type="button" className="closeX" onClick={onClose} aria-label="Đóng">
          <IconX size={20} />
        </button>

        <div className="modalTitleRow">
          <h2 className="titleWithIcon">
            <IconBook size={22} />
            <span>Sổ tay Ngữ pháp &amp; Phát âm TOEIC</span>
          </h2>
        </div>

        <div className="tabs">
          <button
            type="button"
            className={`tab ${tab === 'tenses' ? 'active' : ''}`}
            onClick={() => setTab('tenses')}
          >
            12 Thì Tiếng Anh
          </button>
          <button
            type="button"
            className={`tab ${tab === 'wordform' ? 'active' : ''}`}
            onClick={() => setTab('wordform')}
          >
            Từ loại (Part 5)
          </button>
          <button
            type="button"
            className={`tab ${tab === 'connectors' ? 'active' : ''}`}
            onClick={() => setTab('connectors')}
          >
            Giới từ &amp; Liên từ
          </button>
          <button
            type="button"
            className={`tab ${tab === 'ipa' ? 'active' : ''}`}
            onClick={() => setTab('ipa')}
          >
            Bảng IPA (Bấm nghe)
          </button>
        </div>

        {tab === 'tenses' && (
          <div className="grammarScroll">
            <table className="grammarTable">
              <thead>
                <tr>
                  <th>Thì</th>
                  <th>Công thức</th>
                  <th>Dấu hiệu nhận biết</th>
                  <th>Ví dụ TOEIC</th>
                </tr>
              </thead>
              <tbody>
                {TENSES.map((t) => (
                  <tr key={t.name}>
                    <td className="gBold">{t.name}</td>
                    <td className="gMono">{t.formula}</td>
                    <td>{t.signal}</td>
                    <td>
                      <button
                        type="button"
                        className="gSpeakRow"
                        onClick={() => onSpeak(t.example)}
                        title="Nghe câu ví dụ"
                      >
                        <IconVolume size={14} />
                        <span>{t.example}</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'wordform' && (
          <div className="grammarGrid">
            {WORD_FORMS.map((wf) => (
              <div key={wf.pos} className="grammarCard">
                <h3>{wf.pos}</h3>
                <div className="gRow">
                  <b>Đuôi hay gặp:</b> <span className="gMono">{wf.suffixes}</span>
                </div>
                <div className="gRow">
                  <b>Vị trí trong câu:</b> {wf.positions}
                </div>
                <div className="gExamples">
                  {wf.examples.map((w) => (
                    <button
                      key={w}
                      type="button"
                      className="chip btnIconText"
                      onClick={() => onSpeak(w)}
                    >
                      <IconVolume size={13} />
                      <span>{w}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'connectors' && (
          <div className="grammarGrid">
            {CONNECTORS.map((c) => (
              <div key={c.group} className="grammarCard">
                <h3>{c.group}</h3>
                <div className="gRow">
                  <b>+ Mệnh đề (S + V):</b> <span className="gMono">{c.clause}</span>
                </div>
                <div className="gRow">
                  <b>+ Cụm danh từ / V-ing:</b> <span className="gMono">{c.phrase}</span>
                </div>
                <div className="gTip">{c.tip}</div>
              </div>
            ))}
          </div>
        )}

        {tab === 'ipa' && (
          <div className="grammarScroll">
            {IPA_GROUPS.map((grp) => (
              <div key={grp.title} className="ipaSection">
                <h3>{grp.title}</h3>
                <div className="ipaGrid">
                  {grp.items.map(([sym, word]) => (
                    <button
                      key={sym + word}
                      type="button"
                      className="ipaTile"
                      onClick={() => onSpeak(word)}
                      title={`Nghe phát âm "${word}"`}
                    >
                      <span className="ipaSym">{sym}</span>
                      <span className="ipaWord">{word}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
