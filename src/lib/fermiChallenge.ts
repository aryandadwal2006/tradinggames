import type { SeededRandom } from './rng';

export interface FermiQuestion {
  id: string;
  title: string;
  prompt: string;
  unit: string;
  referenceAnswer: number;
  explanation: string;
  decomposition: string;
}

export interface FermiEvaluation {
  estimate: number;
  referenceAnswer: number;
  factorError: number;
  signedLog10Error: number;
}

export interface FermiRoundResult {
  question: FermiQuestion;
  estimate: number | null;
  skipped: boolean;
  elapsedMs: number;
  evaluation: FermiEvaluation | null;
}

export interface FermiSessionSummary {
  questionCount: number;
  submitted: number;
  skipped: number;
  medianFactorError: number | null;
  geometricMeanFactorError: number | null;
  durationSeconds: number;
  playedAt: string;
}

const QUESTION_BANK: readonly FermiQuestion[] = [
  {
    id: 'heartbeats-day',
    title: 'A day in a heartbeat',
    prompt: 'How many times does an adult human heart beat in one day?',
    unit: 'beats',
    referenceAnswer: 100_000,
    decomposition: 'Start with a resting heart rate around 70 beats per minute. Multiply by 60 minutes per hour and 24 hours per day.',
    explanation: '70 × 60 × 24 = 100,800, so 100,000 is a reasonable rounded reference.'
  },
  {
    id: 'breaths-day',
    title: 'Breathing through the day',
    prompt: 'How many breaths does an adult take over one day?',
    unit: 'breaths',
    referenceAnswer: 20_000,
    decomposition: 'Assume roughly 14 breaths per minute. Scale to an hour, then a full day.',
    explanation: '14 × 60 × 24 = 20,160 breaths per day. The reference is rounded to 20,000.'
  },
  {
    id: 'paper-stack',
    title: 'A metre of paper',
    prompt: 'Approximately how many sheets of ordinary printer paper make a stack one metre tall?',
    unit: 'sheets',
    referenceAnswer: 10_000,
    decomposition: 'A standard sheet is about one tenth of a millimetre thick. One metre is 1,000 millimetres.',
    explanation: '1,000 mm ÷ 0.1 mm per sheet ≈ 10,000 sheets.'
  },
  {
    id: 'rice-kilogram',
    title: 'Rice by the grain',
    prompt: 'How many dry grains of rice are in one kilogram?',
    unit: 'grains',
    referenceAnswer: 50_000,
    decomposition: 'Use a rough grain mass of 20 milligrams. One kilogram is one million milligrams.',
    explanation: '1,000,000 mg ÷ 20 mg per grain ≈ 50,000 grains. Grain size and variety create meaningful variation.'
  },
  {
    id: 'olympic-pool',
    title: 'The pool',
    prompt: 'How many litres of water does an Olympic-sized swimming pool hold?',
    unit: 'litres',
    referenceAnswer: 2_500_000,
    decomposition: 'Use dimensions of 50 metres × 25 metres × 2 metres average depth. One cubic metre is 1,000 litres.',
    explanation: '50 × 25 × 2 = 2,500 m³, or approximately 2.5 million litres.'
  },
  {
    id: 'sand-litre',
    title: 'A litre of sand',
    prompt: 'About how many grains of ordinary dry sand fit into one litre?',
    unit: 'grains',
    referenceAnswer: 10_000_000,
    decomposition: 'Assume grains around half a millimetre across. A spherical grain of that diameter occupies roughly 0.000065 cubic centimetres, before packing gaps.',
    explanation: 'A litre is 1,000 cubic centimetres. Dividing by approximate grain volume and allowing for packing gaps gives an order of magnitude near ten million.'
  },
  {
    id: 'scalp-hair',
    title: 'Hair count',
    prompt: 'Approximately how many strands of hair are on a typical adult human scalp?',
    unit: 'strands',
    referenceAnswer: 100_000,
    decomposition: 'Use the familiar scale of around one hundred thousand follicles with hair on a typical scalp; individuals vary substantially.',
    explanation: 'A useful reference order of magnitude is 10⁵ strands, not a precise count for every person.'
  },
  {
    id: 'novel-letters',
    title: 'A novel in letters',
    prompt: 'How many alphabetic characters are in a 300-page novel?',
    unit: 'letters',
    referenceAnswer: 500_000,
    decomposition: 'Assume around 300 words per page and about five letters per word, ignoring spaces and punctuation.',
    explanation: '300 pages × 300 words/page × 5 letters/word = 450,000 letters, which rounds to about half a million.'
  },
  {
    id: 'piano-tuners',
    title: 'Piano tuners in Chicago',
    prompt: 'How many piano tuners might be working in Chicago?',
    unit: 'tuners',
    referenceAnswer: 70,
    decomposition: 'Start with roughly a million households. If about five percent have a piano, each needs tuning every couple of years, and one tuner completes several hundred jobs a year, divide annual demand by annual capacity.',
    explanation: 'A rough model yields tens of thousands of tunings each year. Dividing by several hundred jobs per tuner gives an order of magnitude of dozens of tuners. The reference is illustrative and depends on assumptions.'
  },
  {
    id: 'planes-airborne',
    title: 'Aircraft in the sky',
    prompt: 'How many commercial passenger flights might be airborne worldwide at a random moment?',
    unit: 'aircraft',
    referenceAnswer: 10_000,
    decomposition: 'Estimate annual flight volume, multiply by a typical flight duration in hours, then divide by the number of hours in a year.',
    explanation: 'The estimate depends on the year and on which flights count. Around ten thousand airborne passenger aircraft is used here as a rough calibration anchor.'
  },
  {
    id: 'commercial-airports',
    title: 'Airports around the world',
    prompt: 'How many commercial airports are there worldwide?',
    unit: 'airports',
    referenceAnswer: 4_000,
    decomposition: 'Separate major commercial airports from the much larger set of private airfields, military bases, and small landing strips.',
    explanation: 'The answer changes with the definition of a commercial airport. Four thousand is a rounded practice anchor, not a universal official count.'
  },
  {
    id: 'air-in-room',
    title: 'Air in a room',
    prompt: 'What is the mass of the air in a 30 m² room with a 2.5 m ceiling?',
    unit: 'kilograms',
    referenceAnswer: 90,
    decomposition: 'Room volume is floor area times height. At ordinary conditions, air density is close to 1.2 kilograms per cubic metre.',
    explanation: '30 × 2.5 = 75 m³; 75 × 1.2 ≈ 90 kg.'
  },
  {
    id: 'drops-litre',
    title: 'Water drops',
    prompt: 'How many drops of water are in one litre?',
    unit: 'drops',
    referenceAnswer: 20_000,
    decomposition: 'A common rough conversion is about 20 drops per millilitre. A litre contains 1,000 millilitres.',
    explanation: '20 drops/mL × 1,000 mL = 20,000 drops. Real drop size depends on the dropper and fluid.'
  },
  {
    id: 'steps-five-km',
    title: 'A five-kilometre walk',
    prompt: 'How many steps does an adult take while walking five kilometres?',
    unit: 'steps',
    referenceAnswer: 6_500,
    decomposition: 'Use an average step length around 0.75 metres and divide the distance by that length.',
    explanation: '5,000 m ÷ 0.75 m/step ≈ 6,667 steps. A reference around 6,500 is reasonable for this model.'
  },
  {
    id: 'blood-pumped',
    title: 'Blood through the heart',
    prompt: 'How many litres of blood does a resting adult heart pump in one day?',
    unit: 'litres',
    referenceAnswer: 7_000,
    decomposition: 'Use a resting cardiac output around five litres per minute and scale to 1,440 minutes per day.',
    explanation: '5 L/min × 60 × 24 = 7,200 L per day. The reference is rounded to 7,000.'
  },
  {
    id: 'molecules-drop',
    title: 'Molecules in a drop',
    prompt: 'How many water molecules are in a 0.05 mL drop of water?',
    unit: 'molecules',
    referenceAnswer: 1.7e21,
    decomposition: 'Take 0.05 mL as 0.05 g of water. Divide by 18 g/mol, then multiply by Avogadro’s constant, about 6 × 10²³ molecules/mol.',
    explanation: '0.05 ÷ 18 × 6.02 × 10²³ ≈ 1.67 × 10²¹ molecules.'
  },
  {
    id: 'cars-built',
    title: 'Cars made in a year',
    prompt: 'How many motor vehicles are manufactured worldwide in a year?',
    unit: 'vehicles',
    referenceAnswer: 90_000_000,
    decomposition: 'Use the scale of tens of millions of vehicles annually across major manufacturing regions.',
    explanation: 'The global total varies by year and by whether commercial vehicles are included. Ninety million is a rounded practice anchor.'
  },
  {
    id: 'seconds-year',
    title: 'Seconds in a year',
    prompt: 'Approximately how many seconds are in a non-leap year?',
    unit: 'seconds',
    referenceAnswer: 31_536_000,
    decomposition: 'Multiply 365 days by 24 hours per day, 60 minutes per hour, and 60 seconds per minute.',
    explanation: '365 × 24 × 60 × 60 = 31,536,000 seconds.'
  }
];

export const FERMI_ROUND_SECONDS = 25;
export const FERMI_ROUNDS_PER_SESSION = 12;

export function generateFermiSession(
  rng: SeededRandom,
  count = FERMI_ROUNDS_PER_SESSION
): FermiQuestion[] {
  if (!Number.isInteger(count) || count < 1 || count > QUESTION_BANK.length) {
    throw new RangeError('Round count must be between 1 and the available question count.');
  }
  return rng.shuffle(QUESTION_BANK).slice(0, count);
}

export function getFermiQuestionCount(): number {
  return QUESTION_BANK.length;
}

export function evaluateFermiEstimate(
  referenceAnswer: number,
  estimate: number
): FermiEvaluation | null {
  if (!Number.isFinite(referenceAnswer) || !Number.isFinite(estimate)) return null;
  if (referenceAnswer <= 0 || estimate <= 0) return null;
  const ratio = estimate / referenceAnswer;
  const factorError = Math.max(ratio, 1 / ratio);
  if (!Number.isFinite(factorError)) return null;
  return {
    estimate,
    referenceAnswer,
    factorError,
    signedLog10Error: Math.log10(ratio)
  };
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const midpoint = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[midpoint] ?? null;
  const lower = sorted[midpoint - 1];
  const upper = sorted[midpoint];
  if (lower === undefined || upper === undefined) return null;
  return (lower + upper) / 2;
}

export function summarizeFermiSession(
  results: readonly FermiRoundResult[],
  durationSeconds: number,
  playedAt = new Date().toISOString()
): FermiSessionSummary {
  const evaluations = results.flatMap((result) => result.evaluation ? [result.evaluation] : []);
  const factors = evaluations.map((evaluation) => evaluation.factorError);
  const meanLog10 = evaluations.length === 0
    ? null
    : evaluations.reduce((sum, evaluation) => sum + Math.log10(evaluation.factorError), 0) / evaluations.length;

  return {
    questionCount: results.length,
    submitted: evaluations.length,
    skipped: results.filter((result) => result.skipped).length,
    medianFactorError: median(factors),
    geometricMeanFactorError: meanLog10 === null ? null : 10 ** meanLog10,
    durationSeconds: Math.max(0, Math.round(durationSeconds)),
    playedAt
  };
}

export function formatFermiNumber(value: number): string {
  if (!Number.isFinite(value)) return '—';
  if (Math.abs(value) >= 1e6 || (Math.abs(value) > 0 && Math.abs(value) < 0.001)) {
    return value.toExponential(2).replace('e+', 'e');
  }
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
}

export function describeFactorError(evaluation: FermiEvaluation): string {
  const direction = evaluation.signedLog10Error > 1e-12
    ? 'too high'
    : evaluation.signedLog10Error < -1e-12 ? 'too low' : 'on target';
  if (direction === 'on target') return 'On target';
  return formatFermiNumber(evaluation.factorError) + '× ' + direction;
}
