/**
 * Languages: English (built in) and Hindi (src/i18n/hi.ts).
 *
 * How it works: shared components (Txt, Button, Input, Chip, Segmented, tab and screen titles) pass
 * their text through t(). If the exact English text is in the dictionary, the Hindi is shown;
 * otherwise the English stays. So a new screen never breaks — it's just English until translated.
 *
 * The language is the member's choice (Profile → Language), or the phone's language the first time.
 * Switching re-draws every screen (see ThemeGate in app/_layout.tsx).
 */
import { getLocales } from 'expo-localization';
import { Children, isValidElement, type ReactNode } from 'react';
import { HI } from '@/i18n/hi';

export type Language = 'en' | 'hi';
export const LANGUAGES: { value: Language; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'hi', label: 'हिन्दी' },
];

let current: Language = 'en';

export const language = () => current;

export function setLanguage(lang: Language) {
  current = lang;
}

/** The phone's language, if we support it. */
export function deviceLanguage(): Language {
  try {
    return getLocales()[0]?.languageCode === 'hi' ? 'hi' : 'en';
  } catch {
    return 'en';
  }
}

/** The language to use: the member's choice (or the phone's language) — but only if the admin has switched Hindi on. */
export function effectiveLanguage(hindiEnabled: boolean, chosen: Language | null): Language {
  return hindiEnabled ? (chosen ?? deviceLanguage()) : 'en';
}

/** Text that changes with numbers, e.g. "3 of 5 habits done". */
const PATTERNS: [RegExp, (...m: string[]) => string][] = [
  [/^(\d+) of (\d+) habits done$/, (_, a, b) => `${b} में से ${a} आदतें पूरी`],
  [/^(\d+) limits? broken$/, (_, a) => `${a} सीमा टूटी`],
  [/^(\d+) days? left$/, (_, a) => `${a} दिन बाक़ी`],
  [/^(\d+) trees? grown from promises you kept$/, (_, a) => `निभाए वादों से ${a} पेड़ उगे`],
  [/^Add (\d+) trackers$/, (_, a) => `${a} ट्रैकर जोड़ें`],
  [/^(\d+) min$/, (_, a) => `${a} मिनट`],
  [/^(\d+) minutes$/, (_, a) => `${a} मिनट`],
  [/^Show (\d+) more$/, (_, a) => `${a} और दिखाएँ`],
  [/^(\d+) changes? couldn’t be saved$/, (_, a) => `${a} बदलाव सेव नहीं हो सके`],
  [/^(\d+) days? within budget$/, (_, a) => `${a} दिन बजट के अंदर`],
  [/^(\d+) clean trading days? on the line$/, (_, a) => `${a} साफ़ ट्रेडिंग दिन दाँव पर`],
  [/^(\d+) trades? left today\.$/, (_, a) => `आज ${a} ट्रेड बाक़ी।`],
  [/^(\d+) trades?\/day$/, (_, a) => `${a} ट्रेड/दिन`],
  [/^Max (\d+) trades? per day$/, (_, a) => `दिन में अधिकतम ${a} ट्रेड`],
  [/^Max daily loss (.+)$/, (_, a) => `रोज़ का अधिकतम नुकसान ${a}`],
  [/^Max loss (.+)$/, (_, a) => `अधिकतम नुकसान ${a}`],
  [/^max loss (.+)$/, (_, a) => `अधिकतम नुकसान ${a}`],
  [/^Target (.+) — then stop$/, (_, a) => `लक्ष्य ${a} — फिर रुकें`],
  [/^Target (.+)$/, (_, a) => `लक्ष्य ${a}`],
  [/^target (.+)$/, (_, a) => `लक्ष्य ${a}`],
  [/^(.+) left of (.+)$/, (_, a, b) => `${b} में से ${a} बाक़ी`],
  [/^(.+) over your daily limit$/, (_, a) => `रोज़ की सीमा से ${a} ज़्यादा`],
  [/^(.+)\/(.+) · over limit$/, (_, a, b) => `${a}/${b} · सीमा से ज़्यादा`],
  [/^(\d+) days? left$/, (_, a) => `${a} दिन बाक़ी`],
  [/^(\d+) badges unlocked!$/, (_, a) => `${a} बैज मिले!`],
  [/^(\d+) promises kept this week$/, (_, a) => `इस हफ़्ते ${a} वादे निभाए`],
  [/^(\d+) trees grown$/, (_, a) => `${a} पेड़ उगे`],
  [/^🌳 (\d+) trees grown this week$/, (_, a) => `🌳 इस हफ़्ते ${a} पेड़ उगे`],
  [/^(\d+)% of my habits kept$/, (_, a) => `मेरी ${a}% आदतें निभाई गईं`],
  [/^▲ (\d+) points better than the week before$/, (_, a) => `▲ पिछले हफ़्ते से ${a} अंक बेहतर`],
  [/^▼ (\d+) points below the week before$/, (_, a) => `▼ पिछले हफ़्ते से ${a} अंक कम`],
  [/^(\d+) more clean trading days to build a (.+)$/, (_, a, b) => `${b} बनाने के लिए ${a} और साफ़ ट्रेडिंग दिन`],
  [/^(.+)\/(.+) clean days · (.+)$/, (_, a, b, c) => `${b} में से ${a} साफ़ दिन · ${c}`],
  [/^(.+) spent$/, (_, a) => `${a} ख़र्च`],
  [/^Added (\d+) trackers?(.*)\.$/, (_, a, rest) => `${a} ट्रैकर जोड़े${rest.replace(/\((\d+) you already had\)/, '($1 पहले से थे)')}।`],
  [/^Cool-off: trading locked until (.+)$/, (_, a) => `कूल-ऑफ़: ${a} तक ट्रेडिंग लॉक`],
  [/^(.+) XP — clean trade$/, (_, a) => `${a} XP — साफ़ ट्रेड`],
  [/^(.+) XP — (\d+) rules? broken$/, (_, a, b) => `${a} XP — ${b} नियम टूटे`],
  [/^\+(\d+) min added to (.+)$/, (_, a, b) => `${t(b)} में +${a} मिनट जुड़े`],
  [/^(.+) checked in for today$/, (_, a) => `${t(a)} आज के लिए दर्ज`],
  [/^Level (\d+)$/, (_, a) => `लेवल ${a}`],
  [/^You beat (.+)! 🏆$/, (_, a) => `आपने ${a} को हरा दिया! 🏆`],
  [/^I beat (.+)!$/, (_, a) => `मैंने ${a} को हरा दिया!`],
  [/^Resend code in (\d+)s$/, (_, a) => `${a} सेकंड में कोड फिर भेजें`],
  [/^Version (.+) is available$/, (_, a) => `वर्ज़न ${a} आ गया है`],
  [/^Start with (.+)$/, (_, a) => `${t(a)} से शुरू करें`],
  [/^Every clean day saves (.+) — watch it add up in Games\.$/, (_, a) => `हर साफ़ दिन ${a} बचाता है — गेम्स में जुड़ता देखिए।`],
  [/^After (\d+) losing trades in a row, you must pause\.$/, (_, a) => `लगातार ${a} नुकसान वाले ट्रेड के बाद आपको रुकना होगा।`],
  [/^A trade losing more than (.+) means the stop-loss wasn't respected\.$/, (_, a) => `${a} से ज़्यादा नुकसान वाला ट्रेड मतलब स्टॉप-लॉस नहीं माना गया।`],
  [/^Lose (.+) or more in a day and the next (\d+) days? (?:is|are) locked\.$/, (_, a, b) => `एक दिन में ${a} या ज़्यादा नुकसान हुआ तो अगले ${b} दिन लॉक रहेंगे।`],
  [/^If an account exists for (.+), a code is on its way\. Enter it with your new password\.$/, (_, a) => `अगर ${a} का अकाउंट है तो कोड आ रहा है। उसे नए पासवर्ड के साथ डालें।`],
  [/^Use this device’s timezone \((.+)\)$/, (_, a) => `इस डिवाइस का समय क्षेत्र इस्तेमाल करें (${a})`],
  [/^ {2}· {2}🩹 healed (\d+)×$/, (_, a) => `  ·  🩹 ${a} बार ठीक हुआ`],
  // Reminder notifications
  [/^🛡️ (.+): read your rules$/, (_, a) => `🛡️ ${t(a)}: अपने नियम पढ़ें`],
  [/^📓 (.+): close your day$/, (_, a) => `📓 ${t(a)}: दिन समेटें`],
  [/^🚫 Stay clean: (.+)$/, (_, a) => `🚫 बचे रहें: ${t(a)}`],
  [/^📉 (.+): stay under your limit$/, (_, a) => `📉 ${t(a)}: सीमा के अंदर रहें`],
  [/^✅ Time for: (.+)$/, (_, a) => `✅ समय हो गया: ${t(a)}`],
  [/^💰 (.+)$/, (_, a) => `💰 ${t(a)}`],
  [/^Max (\d+) trades?(.*)\. Then walk away\.$/, (_, n, rest) => `दिन में अधिकतम ${n} ट्रेड${rest.replace(' · target ', ' · लक्ष्य ').replace(' · max loss ', ' · अधिकतम नुकसान ')}। फिर उठ जाइए।`],
  [/^Protect today’s (.+)\. Close the charts — the market will be there tomorrow\.$/, (_, a) => `आज के ${a} बचाइए। चार्ट बंद करें — बाज़ार कल भी रहेगा।`],
  [/^Great work on (.+)\. Open the app to log it\.$/, (_, a) => `${t(a)} पर बढ़िया काम। दर्ज करने के लिए ऐप खोलें।`],
  [/^Saving (\d+) changes?…$/, (_, a) => `${a} बदलाव सेव हो रहे हैं…`],
  [/^(\d+) changes? saved on your phone · syncing automatically$/, (_, a) => `${a} बदलाव फ़ोन में सेव · अपने-आप सिंक हो रहे हैं`],
];

const EXTRA: Record<string, string> = {
  'Still up': 'अभी तक जाग रहे हैं',
  'Good morning': 'सुप्रभात',
  'Good afternoon': 'नमस्ते',
  'Good evening': 'शुभ संध्या',
};

/** Translate one piece of text (keeps any spaces around it). */
export function t(text: string): string {
  if (current === 'en' || !text) return text;
  const core = text.trim();
  if (!core) return text;
  let hit = HI[core] ?? EXTRA[core];
  if (hit === undefined) {
    for (const [re, fn] of PATTERNS) {
      const m = core.match(re);
      if (m) {
        hit = fn(...m);
        break;
      }
    }
  }
  if (hit === undefined) return text;
  const lead = text.slice(0, text.indexOf(core));
  const trail = text.slice(text.indexOf(core) + core.length);
  return lead + hit + trail;
}

/** Translate the plain-text parts of a component's children (numbers and elements stay as they are). */
export function tChildren(children: ReactNode): ReactNode {
  if (current === 'en') return children;
  if (typeof children === 'string') return t(children);
  if (!Array.isArray(children)) return children;
  // Join neighbouring text pieces first, so "{n} day streak" style pieces still match the dictionary
  const parts = Children.toArray(children);
  if (parts.every((p) => typeof p === 'string' || typeof p === 'number')) {
    const whole = parts.join('');
    const translated = t(whole);
    if (translated !== whole) return translated;
  }
  return Children.map(children, (child) => (typeof child === 'string' ? t(child) : isValidElement(child) ? child : child));
}
