import { SafetyCategory, SafetyScanResult, SafetySeverity } from '../types/safety';

interface RuleDefinition {
  category: SafetyCategory;
  severity: SafetySeverity;
  label: string;
  patterns: (string | RegExp)[];
}

// Tailored rules covering Kenyan civic and global digital safety
const SAFETY_RULES: RuleDefinition[] = [
  // 1. INCITEMENT & ETHNIC HATE SPEECH
  {
    category: 'incitement',
    severity: 'high',
    label: 'Incitement to violence or ethnic hate speech',
    patterns: [
      // Ethnic slurs and tribal incitement patterns
      /\b(madoadoa|kihii|kwekwe|bung'oong'o|chaget|nyayo zao)\b/i,
      /\b(choma|burn\s+down)\s+(their|hawa|boma|house|estate|church|mosque|business)\b/i,
      /\b(evict|drive\s+out|fukuza|toa)\s+(all|watu\s+wa|all\s+the)\s+(kikuyu|luo|kalenjin|luhya|kamba|somali|kisii|meru|embu|maasai|mijikenda)\b/i,
      /\b(kill|piga|chinja|slay|eliminate)\s+(all|wote|hawa|these\s+people)\b/i,
      /\b(war|vita|bloodshed)\s+(is\s+coming|imeanza|lazima)\b/i,
      /\b(ethnic\s+cleansing|tribal\s+war|civil\s+war)\b/i,
      /\b(take\s+up\s+arms|beba\s+silaha|panga|rungu)\s+(against|kushambulia)\b/i,
      /\bincite|incitement|tribalism|hate\s+speech|sub-tribe\s+clashes\b/i
    ]
  },

  // 2. NUDITY & EXPLICIT SEXUAL CONTENT
  {
    category: 'nudity',
    severity: 'high',
    label: 'Explicit sexual content or nudity',
    patterns: [
      /\b(porn|porno|pornography|xxx|nsfw|nude|nudes|nudity|naked)\b/i,
      /\b(sex\s+video|twerk\s+naked|onlyfans|leaked\s+sex|tape\s+leaked)\b/i,
      /\b(pussy|dick|penis|vagina|blowjob|anal\s+sex|cumshot)\b/i,
      /\b(escort\s+service|lanye|hooker|kuma|mboo|malaya)\b/i,
      /\b(send\s+nudes|nudes\s+dm|free\s+sex)\b/i,
      /\b(pedophile|child\s+abuse|underage\s+sex)\b/i
    ]
  },

  // 3. DANGEROUS INFORMATION & VIOLENT THREATS
  {
    category: 'dangerous',
    severity: 'high',
    label: 'Dangerous content, weapons, or physical threat',
    patterns: [
      /\b(make\s+a\s+bomb|build\s+an\s+ied|pipe\s+bomb|molotov\s+cocktail)\b/i,
      /\b(buy\s+unlicensed\s+gun|sell\s+ak-47|pistol\s+for\s+sale\s+no\s+permit)\b/i,
      /\b(poison\s+someone|cyanide|anthrax|ricin)\b/i,
      /\b(how\s+to\s+commit\s+suicide|kill\s+myself|end\s+my\s+life)\b/i,
      /\b(i\s+will\s+shoot|i\s+will\s+bomb|i\s+will\s+stab|bomb\s+threat)\b/i,
      /\b(hire\s+a\s+hitman|assassinate|assassination)\b/i
    ]
  },

  // 4. MISLEADING INFORMATION, FRAUD & SCAMS
  {
    category: 'misleading',
    severity: 'medium',
    label: 'Misleading information, fraud, or financial scam',
    patterns: [
      // M-Pesa fraud & cash doubling scams
      /\b(send\s+money\s+double|cash\s+multiplier|invest\s+1000\s+get\s+5000)\b/i,
      /\b(mpesa\s+hack|m-pesa\s+glitch|free\s+mpesa\s+money)\b/i,
      /\b(safari\s+com\s+reversal|fake\s+mpesa\s+sms)\b/i,
      /\b(send\s+registration\s+fee\s+first|lipa\s+interview\s+fee)\b/i,
      /\b(kdf\s+recruitment\s+fee|police\s+recruitment\s+letter\s+for\s+sale)\b/i,
      /\b(guaranteed\s+500%\s+daily|crypto\s+ponzi|forex\s+sure\s+win)\b/i,
      /\b(miracle\s+cure\s+for\s+hiv|cure\s+cancer\s+with\s+lemon)\b/i,
      /\b(government\s+giving\s+free\s+50000\s+click\s+here)\b/i,
      /\b(claim\s+your\s+inua\s+jamii\s+bonus\s+via\s+whatsapp)\b/i
    ]
  },

  // 5. SPAM & REPETITIVE ABUSIVE HARASSMENT
  {
    category: 'spam',
    severity: 'low',
    label: 'Spam or unsolicited advertising',
    patterns: [
      /\b(whatsapp\s+me\s+at\s+07\d{8}\s+for\s+magic)\b/i,
      /\b(mganga\s+kutoka\s+kitui|daktari\s+wa\s+kienyeji\s+kurudisha\s+mpenzi)\b/i,
      /\b(win\s+betting\s+fixed\s+matches\s+100%|sure\s+odds\s+inbox)\b/i
    ]
  }
];

/**
 * Evaluates text and title against community safety guidelines.
 */
export function analyzeContentSafety(text: string, title: string = ''): SafetyScanResult {
  const combined = `${title} ${text}`.toLowerCase();
  const matchedKeywords: string[] = [];
  const triggeredCategories: SafetyCategory[] = [];
  let highestSeverity: SafetySeverity = 'clean';
  let flagReason = '';

  for (const rule of SAFETY_RULES) {
    for (const pattern of rule.patterns) {
      let isMatch = false;
      let matchedText = '';

      if (typeof pattern === 'string') {
        if (combined.includes(pattern.toLowerCase())) {
          isMatch = true;
          matchedText = pattern;
        }
      } else {
        const match = pattern.exec(combined);
        if (match) {
          isMatch = true;
          matchedText = match[0];
        }
      }

      if (isMatch) {
        if (!triggeredCategories.includes(rule.category)) {
          triggeredCategories.push(rule.category);
        }
        if (!matchedKeywords.includes(matchedText)) {
          matchedKeywords.push(matchedText);
        }

        // Elevate severity if higher
        if (rule.severity === 'high') {
          highestSeverity = 'high';
          flagReason = rule.label;
        } else if (rule.severity === 'medium' && highestSeverity !== 'high') {
          highestSeverity = 'medium';
          flagReason = rule.label;
        } else if (rule.severity === 'low' && highestSeverity === 'clean') {
          highestSeverity = 'low';
          flagReason = rule.label;
        }
      }
    }
  }

  const isSafe = highestSeverity === 'clean' || (highestSeverity === 'low' && matchedKeywords.length <= 1);
  const confidence = matchedKeywords.length > 0 ? Math.min(0.98, 0.65 + matchedKeywords.length * 0.1) : 0.99;

  let recommendation: 'allow' | 'warn' | 'block' = 'allow';
  if (highestSeverity === 'high') {
    recommendation = 'block';
  } else if (highestSeverity === 'medium' || triggeredCategories.length > 1) {
    recommendation = 'warn';
  }

  return {
    isSafe,
    severity: highestSeverity,
    triggeredCategories,
    flagReason: flagReason || (isSafe ? 'Clean content' : 'Flagged content'),
    matchedKeywords,
    confidence: Number(confidence.toFixed(2)),
    recommendation
  };
}

/**
 * Formats a user-friendly safety explanation for the Kenyan community
 */
export function getSafetyExplanation(category: SafetyCategory): { title: string; desc: string; advice: string } {
  switch (category) {
    case 'incitement':
      return {
        title: 'Msimamo dhidi ya Chuki na Uchochezi (No Hate Speech or Incitement)',
        desc: 'TUJUANE is a peaceful Kenyan platform built to unite all 47 counties. Ethnic slurs, calls to violence, or tribal incitement violate our community constitution and Kenya Law (NCIC Act).',
        advice: 'Express your civic views constructively without targeting any community or inciting hostility.'
      };
    case 'nudity':
      return {
        title: 'Maudhui ya Watu Wazima Yamezuiwa (No Nudity or Adult Content)',
        desc: 'Explicit sexual content, adult solicitation, or non-consensual imagery is strictly prohibited to keep TUJUANE safe for families, students, and citizens of all ages.',
        advice: 'Please share community-friendly photos, cultural showcases, or business media.'
      };
    case 'misleading':
      return {
        title: 'Onyo la Ulaghai na Habari za Kupotosha (No Scams or Misleading Info)',
        desc: 'Posts promoting M-Pesa cash doubling, recruitment fees for public jobs (KDF/Police), or unverified medical cures are flagged to protect citizens from financial and health fraud.',
        advice: 'Share genuine hustles, verified government notices, and transparent opportunities.'
      };
    case 'dangerous':
      return {
        title: 'Usalama wa Jamii Kwanza (Dangerous Material Prohibited)',
        desc: 'Information detailing weapons, explosives, physical threats, or self-harm is strictly banned under our zero-tolerance policy.',
        advice: 'If you or someone you know is in distress, please seek official counseling or local emergency support.'
      };
    case 'spam':
    default:
      return {
        title: 'Ujumbe wa Kibiashara usioidhinishwa (Spam Protection)',
        desc: 'Repeated promotional messages or deceptive links clutter community conversations.',
        advice: 'Share your business respectfully in the Hustle category.'
      };
  }
}
