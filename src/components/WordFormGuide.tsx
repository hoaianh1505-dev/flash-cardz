'use client';

import { useMemo, useState } from 'react';
import { IconEye, IconEyeOff, IconSearch, IconVolume } from './Icons';

type SuffixRow = [string, string, string];

const NOUN_SUFFIXES: SuffixRow[] = [
  ['-tion / -ation', 'Hành động, quá trình, kết quả', 'educate → education (giáo dục); inform → information (thông tin)'],
  ['-sion / -ssion', 'Hành động, kết quả', 'decide → decision (quyết định); discuss → discussion (thảo luận)'],
  ['-ment', 'Quá trình, kết quả, trạng thái', 'develop → development (sự phát triển); achieve → achievement (thành tựu)'],
  ['-ness', 'Tính chất, trạng thái', 'kind → kindness (lòng tốt); dark → darkness (bóng tối)'],
  ['-ity / -ty', 'Tính chất, trạng thái', 'active → activity (hoạt động); safe → safety (sự an toàn)'],
  ['-ance / -ence', 'Trạng thái, hành động', 'appear → appearance (vẻ ngoài); exist → existence (sự tồn tại)'],
  ['-ancy / -ency', 'Trạng thái, tính chất', 'vacant → vacancy (chỗ trống); fluent → fluency (sự lưu loát)'],
  ['-cy / -acy', 'Trạng thái, hệ thống', 'accurate → accuracy (độ chính xác); private → privacy (sự riêng tư)'],
  ['-er / -or', 'Người/vật thực hiện việc', 'teach → teacher (giáo viên); act → actor (diễn viên)'],
  ['-ist', 'Người theo nghề/lĩnh vực', 'art → artist (nghệ sĩ); science → scientist (nhà khoa học)'],
  ['-ian / -ician', 'Người thuộc lĩnh vực', 'music → musician (nhạc sĩ); technique → technician (kỹ thuật viên)'],
  ['-ee', 'Người nhận/chịu tác động', 'employ → employee (nhân viên); train → trainee (người được đào tạo)'],
  ['-ant / -ent', 'Người/vật có vai trò', 'assist → assistant (trợ lý); reside → resident (cư dân)'],
  ['-ship', 'Quan hệ, địa vị, kỹ năng', 'friend → friendship (tình bạn); leader → leadership (khả năng lãnh đạo)'],
  ['-hood', 'Giai đoạn, trạng thái', 'child → childhood (tuổi thơ); neighbor → neighborhood (khu dân cư)'],
  ['-dom', 'Trạng thái, phạm vi', 'free → freedom (tự do); king → kingdom (vương quốc)'],
  ['-ism', 'Hệ tư tưởng, hiện tượng', 'capital → capitalism (chủ nghĩa tư bản); tourist → tourism (du lịch)'],
  ['-age', 'Kết quả, tập hợp, hoạt động', 'store → storage (sự lưu trữ); marry → marriage (hôn nhân)'],
  ['-al', 'Hành động hoặc kết quả', 'arrive → arrival (sự đến); refuse → refusal (sự từ chối)'],
  ['-ure / -ture', 'Hành động, kết quả', 'fail → failure (thất bại); depart → departure (sự khởi hành)'],
  ['-th', 'Trạng thái, mức độ', 'grow → growth (sự tăng trưởng); wide → width (chiều rộng)'],
  ['-ing', 'Hoạt động, kết quả', 'read → reading (việc đọc); build → building (tòa nhà)'],
  ['-ery / -ry', 'Nơi chốn, nghề, hoạt động', 'bake → bakery (tiệm bánh); brave → bravery (lòng dũng cảm)'],
  ['-let / -ette', 'Dạng nhỏ (không phải luôn luôn)', 'book → booklet (cuốn sách nhỏ); kitchen → kitchenette (bếp nhỏ)'],
  ['-ling', 'Người/vật nhỏ, non', 'duck → duckling (vịt con); year → yearling (con vật một tuổi)'],
  ['-ful', 'Một lượng đầy (danh từ)', 'hand → handful (một nắm); spoon → spoonful (một thìa đầy)'],
  ['-craft', 'Nghề, kỹ năng', 'wood → woodcraft (nghề thủ công gỗ); state → statecraft (nghệ thuật trị quốc)'],
];

const ADJ_SUFFIXES: SuffixRow[] = [
  ['-ful', 'Đầy, có', 'care → careful (cẩn thận); hope → hopeful (đầy hy vọng)'],
  ['-less', 'Thiếu, không có', 'care → careless (bất cẩn); home → homeless (vô gia cư)'],
  ['-ous / -ious', 'Có tính chất, nhiều', 'danger → dangerous (nguy hiểm); mystery → mysterious (bí ẩn)'],
  ['-eous', 'Có tính chất', 'courage → courageous (dũng cảm); advantage → advantageous (có lợi)'],
  ['-able / -ible', 'Có thể, đáng', 'read → readable (dễ đọc); access → accessible (có thể tiếp cận)'],
  ['-ive / -ative', 'Có xu hướng, tính chất', 'create → creative (sáng tạo); talk → talkative (hay nói)'],
  ['-al / -ial', 'Thuộc về', 'nature → natural (tự nhiên); finance → financial (thuộc tài chính)'],
  ['-ic / -ical', 'Liên quan, mang tính', 'artist → artistic (nghệ thuật); history → historical (thuộc lịch sử)'],
  ['-y', 'Nhiều, có tính chất', 'rain → rainy (có mưa); noise → noisy (ồn ào)'],
  ['-ish', 'Hơi, giống, mang tính', 'green → greenish (hơi xanh); child → childish (trẻ con)'],
  ['-like', 'Giống như', 'child → childlike (ngây thơ); dream → dreamlike (như mơ)'],
  ['-en', 'Làm bằng vật liệu', 'wood → wooden (bằng gỗ); gold → golden (bằng/vàng óng)'],
  ['-ant / -ent', 'Có tính chất', 'importance → important (quan trọng); differ → different (khác biệt)'],
  ['-ary / -ory', 'Thuộc về', 'imagine → imaginary (tưởng tượng); sense → sensory (giác quan)'],
  ['-ed', 'Cảm thấy/đã chịu tác động', 'bore → bored (chán); interest → interested (hứng thú)'],
  ['-ing', 'Gây cảm xúc / đang có tính chất', 'bore → boring (nhàm chán); excite → exciting (hào hứng)'],
  ['-some', 'Gây, có xu hướng', 'trouble → troublesome (phiền phức); fear → fearsome (đáng sợ)'],
  ['-ern', 'Thuộc hướng/vùng', 'east → eastern (phía đông); north → northern (phía bắc)'],
  ['-ese', 'Thuộc quốc gia/ngôn ngữ', 'Japan → Japanese (thuộc Nhật Bản); China → Chinese (thuộc Trung Quốc)'],
  ['-an / -ian', 'Thuộc người/nơi/lĩnh vực', 'America → American (thuộc Mỹ); history → historian (nhà sử học: danh từ)'],
  ['-ward', 'Hướng về', 'home → homeward (hướng về nhà); north → northward (hướng bắc)'],
  ['-proof', 'Chống, không bị ảnh hưởng', 'water → waterproof (chống nước); sound → soundproof (cách âm)'],
  ['-free', 'Không chứa/không có', 'sugar → sugar-free (không đường); stress → stress-free (không căng thẳng)'],
  ['-wide', 'Trên toàn phạm vi', 'world → worldwide (toàn thế giới); nation → nationwide (toàn quốc)'],
];

const VERB_SUFFIXES: SuffixRow[] = [
  ['-ize / -ise', 'Làm cho trở thành, áp dụng', 'modern → modernize (hiện đại hóa); legal → legalise (hợp pháp hóa)'],
  ['-ify / -fy', 'Làm cho, biến thành', 'simple → simplify (đơn giản hóa); pure → purify (làm tinh khiết)'],
  ['-en', 'Làm cho trở nên', 'short → shorten (rút ngắn); strength → strengthen (củng cố)'],
  ['-ate', 'Làm, khiến, thực hiện', 'active → activate (kích hoạt); valid → validate (xác nhận hợp lệ)'],
];

const ADV_SUFFIXES: SuffixRow[] = [
  ['-ly', 'Một cách; thường chỉ cách thức', 'quick → quickly (nhanh chóng); careful → carefully (cẩn thận)'],
  ['-ward / -wards', 'Theo hướng', 'back → backward(s) (về phía sau); home → homeward(s) (về nhà)'],
  ['-wise', 'Theo cách/hướng/phương diện', 'clock → clockwise (theo chiều kim đồng hồ); length → lengthwise (theo chiều dài)'],
  ['-ways', 'Theo hướng/cách', 'side → sideways (sang bên); cross → crossways (theo chiều ngang)'],
];

const EXCEPTIONS: string[] = [
  '-al: natural (Adj) nhưng arrival (N). -ful: helpful (Adj) nhưng handful (N).',
  '-en: shorten (V) nhưng wooden (Adj). -ing: reading (N/động danh từ) nhưng interesting (Adj).',
  '-ly: quickly (Adv) nhưng friendly, lovely, lonely (Adj). Không phải trạng từ nào cũng có -ly: fast, hard, well.',
  '-ed và -ing: I am bored (tôi thấy chán); The film is boring (bộ phim gây chán).',
  '-ic / -ical: đôi khi khác nghĩa: economic (thuộc kinh tế) và economical (tiết kiệm).',
  '-ist / -ian: thường chỉ người, nhưng không phải lúc nào cũng suy ra nghĩa chính xác từ đuôi.',
  '-ize / -ise: có biến thể chính tả Anh–Mỹ (organize/organise); không phải mọi từ đều thay thế được tùy tiện.',
  "Không phải mọi chuỗi chữ ở cuối từ đều là hậu tố: corner không phải 'corn + -er' với nghĩa người; hãy tra từ điển khi không chắc.",
  'Đổi chính tả: happy → happiness; beauty → beautiful; decide → decision; strong → strength.',
];

const WORD_FAMILIES: [string, string, string, string][] = [
  ['beauty', 'beautify', 'beautiful', 'beautifully'],
  ['success', 'succeed', 'successful', 'successfully'],
  ['decision', 'decide', 'decisive', 'decisively'],
  ['creation', 'create', 'creative', 'creatively'],
  ['strength', 'strengthen', 'strong', 'strongly'],
  ['difference', 'differ', 'different', 'differently'],
  ['simplicity', 'simplify', 'simple', 'simply'],
  ['danger', 'endanger', 'dangerous', 'dangerously'],
  ['education', 'educate', 'educational', 'educationally'],
  ['accuracy', '—', 'accurate', 'accurately'],
  ['happiness', '—', 'happy', 'happily'],
  ['development', 'develop', 'developed / developing', '—'],
  ['improvement', 'improve', 'improved', '—'],
  ['explanation', 'explain', 'explanatory', '—'],
  ['reliability', 'rely', 'reliable', 'reliably'],
  ['preparation', 'prepare', 'prepared', '—'],
];

const SENTENCE_TIPS: string[] = [
  'Sau a/an/the hoặc tính từ thường cần N: a beautiful painting.',
  'Sau be, seem, become thường cần Adj: She is careful.',
  'Sau động từ thường có thể cần Adv chỉ cách thức: She speaks clearly.',
  'Sau modal (can, should, must) thường cần V nguyên mẫu: can simplify.',
  'Đứng trước danh từ thường cần Adj: a dangerous road.',
  'Luôn xem nghĩa toàn câu: cùng vị trí có thể có nhiều cấu trúc ngữ pháp khác nhau.',
];

const EXERCISES: { n: number; q: string; ans: string }[] = [
  { n: 1, q: 'Her ______ (kind) impressed everyone.', ans: 'kindness' },
  { n: 2, q: 'This is a very ______ (danger) road.', ans: 'dangerous' },
  { n: 3, q: 'Please speak ______ (clear).', ans: 'clearly' },
  { n: 4, q: 'We need to ______ (simple) the instructions.', ans: 'simplify' },
  { n: 5, q: 'The project was a great ______ (succeed).', ans: 'success' },
  { n: 6, q: 'He made an important ______ (decide).', ans: 'decision' },
  { n: 7, q: 'The lesson was ______ (interest).', ans: 'interesting' },
  { n: 8, q: 'I felt ______ (bore) during the wait.', ans: 'bored' },
  { n: 9, q: 'They hope to ______ (modern) the school.', ans: 'modernize' },
  { n: 10, q: 'She answered the question ______ (accurate).', ans: 'accurately' },
  { n: 11, q: 'Their ______ (friend) lasted for years.', ans: 'friendship' },
  { n: 12, q: 'The children played ______ (happy).', ans: 'happily' },
  { n: 13, q: 'Regular practice can ______ (strong) your skills.', ans: 'strengthen' },
  { n: 14, q: 'The museum has great ______ (history) value.', ans: 'historical' },
  { n: 15, q: 'This website is easily ______ (access).', ans: 'accessible' },
  { n: 16, q: 'He is a very ______ (create) student.', ans: 'creative' },
  { n: 17, q: 'The city experienced rapid ______ (grow).', ans: 'growth' },
  { n: 18, q: 'The speech was very ______ (inspire).', ans: 'inspiring' },
  { n: 19, q: 'Her ______ (able) to learn is impressive.', ans: 'ability' },
  { n: 20, q: 'The team worked ______ (effective).', ans: 'effectively' },
];

type SectionKey = 'all' | 'noun' | 'adj' | 'verb' | 'adv' | 'exc' | 'family' | 'tips' | 'ex';

interface Props {
  onSpeak: (text: string, slow?: boolean) => void;
}

export default function WordFormGuide({ onSpeak }: Props) {
  const [section, setSection] = useState<SectionKey>('all');
  const [search, setSearch] = useState('');
  const [showAnswers, setShowAnswers] = useState(false);
  const [filtersCollapsed, setFiltersCollapsed] = useState(false);

  const q = search.trim().toLowerCase();

  const filterRows = (rows: SuffixRow[]) =>
    !q ? rows : rows.filter((r) => r.some((cell) => cell.toLowerCase().includes(q)));

  const filteredNouns = useMemo(() => filterRows(NOUN_SUFFIXES), [q]);
  const filteredAdjs = useMemo(() => filterRows(ADJ_SUFFIXES), [q]);
  const filteredVerbs = useMemo(() => filterRows(VERB_SUFFIXES), [q]);
  const filteredAdvs = useMemo(() => filterRows(ADV_SUFFIXES), [q]);
  const filteredFamilies = useMemo(
    () => (!q ? WORD_FAMILIES : WORD_FAMILIES.filter((r) => r.some((c) => c.toLowerCase().includes(q)))),
    [q]
  );

  const show = (k: Exclude<SectionKey, 'all'>) => section === 'all' || section === k;

  return (
    <div className="wfWrap">
      {/* Compact Filter & Search Header */}
      <section className="pagePanel wfIntroCard" style={{ padding: '14px 18px' }}>
        <div
          className="libTopRow"
          style={{ marginBottom: filtersCollapsed ? 0 : 12 }}
        >
          <div className="searchFieldWrap" style={{ flex: 1, minWidth: 220 }}>
            <IconSearch size={16} className="searchFieldIcon" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm hậu tố (-tion, -able...) hoặc ví dụ..."
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
          <div className="catChips" style={{ marginBottom: 0 }}>
            {(
              [
                ['all', 'Tất cả'],
                ['noun', 'Danh từ (27)'],
                ['adj', 'Tính từ (24)'],
                ['verb', 'Động từ (4)'],
                ['adv', 'Trạng từ (4)'],
                ['exc', 'Ngoại lệ'],
                ['family', 'Họ từ (16)'],
                ['tips', 'Mẹo xác định'],
                ['ex', 'Bài tập (20)'],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                className={`chip ${section === k ? 'active' : ''}`}
                onClick={() => setSection(k)}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* 1. HẬU TỐ DANH TỪ */}
      {show('noun') && filteredNouns.length > 0 && (
        <section className="pagePanel">
          <h2 className="wfSectionTitle">1. Hậu tố Danh từ (Noun)</h2>
          <div className="wfTableWrap">
            <table className="wfTable">
              <thead>
                <tr>
                  <th style={{ width: 170 }}>Hậu tố</th>
                  <th style={{ width: 280 }}>Ý nghĩa thường gặp</th>
                  <th>Ví dụ (nghĩa tiếng Việt)</th>
                </tr>
              </thead>
              <tbody>
                {filteredNouns.map(([suf, mean, ex]) => (
                  <tr key={suf}>
                    <td className="wfSuffix">{suf}</td>
                    <td>{mean}</td>
                    <td className="wfEx">{ex}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* 2. HẬU TỐ TÍNH TỪ */}
      {show('adj') && filteredAdjs.length > 0 && (
        <section className="pagePanel">
          <h2 className="wfSectionTitle">2. Hậu tố Tính từ (Adjective)</h2>
          <div className="wfTableWrap">
            <table className="wfTable">
              <thead>
                <tr>
                  <th style={{ width: 170 }}>Hậu tố</th>
                  <th style={{ width: 280 }}>Ý nghĩa thường gặp</th>
                  <th>Ví dụ (nghĩa tiếng Việt)</th>
                </tr>
              </thead>
              <tbody>
                {filteredAdjs.map(([suf, mean, ex]) => (
                  <tr key={suf}>
                    <td className="wfSuffix">{suf}</td>
                    <td>{mean}</td>
                    <td className="wfEx">{ex}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* 3. HẬU TỐ ĐỘNG TỪ */}
      {show('verb') && filteredVerbs.length > 0 && (
        <section className="pagePanel">
          <h2 className="wfSectionTitle">3. Hậu tố Động từ (Verb)</h2>
          <div className="wfTableWrap">
            <table className="wfTable">
              <thead>
                <tr>
                  <th style={{ width: 170 }}>Hậu tố</th>
                  <th style={{ width: 280 }}>Ý nghĩa thường gặp</th>
                  <th>Ví dụ (nghĩa tiếng Việt)</th>
                </tr>
              </thead>
              <tbody>
                {filteredVerbs.map(([suf, mean, ex]) => (
                  <tr key={suf}>
                    <td className="wfSuffix">{suf}</td>
                    <td>{mean}</td>
                    <td className="wfEx">{ex}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* 4. HẬU TỐ TRẠNG TỪ */}
      {show('adv') && filteredAdvs.length > 0 && (
        <section className="pagePanel">
          <h2 className="wfSectionTitle">4. Hậu tố Trạng từ (Adverb)</h2>
          <div className="wfTableWrap">
            <table className="wfTable">
              <thead>
                <tr>
                  <th style={{ width: 170 }}>Hậu tố</th>
                  <th style={{ width: 280 }}>Ý nghĩa thường gặp</th>
                  <th>Ví dụ (nghĩa tiếng Việt)</th>
                </tr>
              </thead>
              <tbody>
                {filteredAdvs.map(([suf, mean, ex]) => (
                  <tr key={suf}>
                    <td className="wfSuffix">{suf}</td>
                    <td>{mean}</td>
                    <td className="wfEx">{ex}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* 5. CÁC ĐUÔI DỄ NHẦM & NGOẠI LỆ */}
      {show('exc') && (
        <section className="pagePanel">
          <h2 className="wfSectionTitle">5. Các đuôi dễ nhầm &amp; Ngoại lệ</h2>
          <ul className="wfBulletList">
            {EXCEPTIONS.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </section>
      )}

      {/* 6. BẢNG HỌ TỪ (WORD FAMILIES) */}
      {show('family') && filteredFamilies.length > 0 && (
        <section className="pagePanel">
          <h2 className="wfSectionTitle">6. Bảng họ từ (Word Families)</h2>
          <p className="pageSub" style={{ marginBottom: 12 }}>
            Bấm vào bất kỳ từ nào trong bảng để nghe phát âm · Dấu — nghĩa là không có dạng thông
            dụng tương ứng được liệt kê.
          </p>
          <div className="wfTableWrap">
            <table className="wfTable">
              <thead>
                <tr>
                  <th>Danh từ (N)</th>
                  <th>Động từ (V)</th>
                  <th>Tính từ (Adj)</th>
                  <th>Trạng từ (Adv)</th>
                </tr>
              </thead>
              <tbody>
                {filteredFamilies.map((row, rIdx) => (
                  <tr key={rIdx}>
                    {row.map((cell, cIdx) => (
                      <td key={cIdx}>
                        {cell === '—' ? (
                          <span style={{ color: 'var(--ink-faint)' }}>—</span>
                        ) : (
                          <button
                            type="button"
                            className="wfSpeakCell"
                            onClick={() => onSpeak(cell.split('/')[0].trim(), false)}
                            title={`Nghe phát âm "${cell}"`}
                          >
                            <IconVolume size={14} />
                            <span>{cell}</span>
                          </button>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* 7. MẸO XÁC ĐỊNH TỪ LOẠI TRONG CÂU */}
      {show('tips') && (
        <section className="pagePanel">
          <h2 className="wfSectionTitle">7. Mẹo xác định từ loại trong câu</h2>
          <ul className="wfBulletList">
            {SENTENCE_TIPS.map((tip, i) => (
              <li key={i}>{tip}</li>
            ))}
          </ul>
        </section>
      )}

      {/* 8. BÀI TẬP WORD FORM + ĐÁP ÁN + 9. LỘ TRÌNH HỌC */}
      {show('ex') && (
        <>
          <section className="pagePanel">
            <div className="pagePanelHead" style={{ marginBottom: 14 }}>
              <div>
                <h2 className="wfSectionTitle" style={{ marginBottom: 2 }}>
                  8. Bài tập Word Form (20 câu)
                </h2>
                <p className="pageSub">Tự điền dạng đúng của từ trong ngoặc rồi bật đáp án để dò.</p>
              </div>
              <button
                type="button"
                className={`btnIconText ${showAnswers ? 'primary' : 'soft'}`}
                onClick={() => setShowAnswers((v) => !v)}
              >
                {showAnswers ? <IconEyeOff size={16} /> : <IconEye size={16} />}
                <span>{showAnswers ? 'Ẩn đáp án' : 'Hiện đáp án'}</span>
              </button>
            </div>

            <div className="wfExerciseGrid">
              {EXERCISES.map((ex) => (
                <div key={ex.n} className="wfExerciseRow">
                  <span className="wfExNum">{ex.n}.</span>
                  <div className="wfExBody">
                    <span>{ex.q}</span>
                    {showAnswers && <span className="wfAnsPill">→ {ex.ans}</span>}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="pagePanel">
            <h2 className="wfSectionTitle">9. Lộ trình học gợi ý (7 ngày)</h2>
            <p className="wfRoadmapText">
              <b>Ngày 1–2:</b> Danh từ · <b>Ngày 3–4:</b> Tính từ · <b>Ngày 5:</b> Động từ và Trạng
              từ · <b>Ngày 6:</b> Bảng họ từ · <b>Ngày 7:</b> Làm 20 câu bài tập và ôn các đuôi dễ
              nhầm. Mỗi ngày tự đặt 5 câu có từ mới.
            </p>
            <p className="wfUsageSub" style={{ marginTop: 8 }}>
              Ghi nhớ: Hậu tố là công cụ dự đoán, không thay thế việc học nghĩa từ, ngữ pháp và tra
              từ điển.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
