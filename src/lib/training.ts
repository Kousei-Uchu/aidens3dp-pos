/** Declarative training content. Add or revise lessons here without coupling them to screen layout. */
export type TrainingChoice = { id: string; label: string };
export type TrainingScenario = {
  id: string;
  kind: 'smooth' | 'recovery';
  title: string;
  prompt: string;
  choices: TrainingChoice[];
  answer: string;
  hints: string[];
};
export type TrainingModule = {
  id: string;
  title: string;
  summary: string;
  duration: string;
  helpId: string;
  when: string;
  outcome: string;
  slides: { title: string; body: string; icon: string; caption: string }[];
  flow: { title: string; body: string }[];
  guide: { title: string; instruction: string; button: string; feedback: string }[];
  scenarios: [TrainingScenario, TrainingScenario];
  celebration: string;
};

export const TRAINING_MODULES: TrainingModule[] = [
  {
    id: 'add-first-item',
    title: 'Find and add an item',
    summary: 'Use the quick grid, product search or scanner to add the right item to a sale.',
    duration: '3 min',
    helpId: 'sales',
    when: 'Start here whenever a customer brings an item to the counter. The item must be in the POS catalogue before it can be added.',
    outcome: 'You can choose an item, confirm it appears in the cart, and recover when a scan does not match.',
    slides: [
      { title: 'Start with the item', body: 'The Checkout screen is the starting point for a sale. Quick Menu tiles are shortcuts; All products and Search help when you cannot find a tile.', icon: 'grid-outline', caption: 'Checkout · Quick Menu · All products' },
      { title: 'A scan is a lookup', body: 'A barcode or SKU identifies a catalogue item. The POS looks it up and adds a match. A scan that is not recognised does not add a guessed item.', icon: 'barcode-outline', caption: 'Scan → exact catalogue match' },
      { title: 'Check the cart', body: 'After adding an item, check its name, quantity and price in the cart before moving on. A tile with variations asks you to choose the correct one.', icon: 'cart-outline', caption: 'Right item · right variation · right quantity' },
    ],
    flow: [
      { title: 'Choose a route', body: 'Tap a Quick Menu tile, browse All products, search, or scan the item.' },
      { title: 'Resolve the item', body: 'The POS matches a scan to the catalogue, or lets you pick the exact product and variation.' },
      { title: 'Confirm the cart', body: 'The item and quantity appear in the cart. Check them before continuing the sale.' },
    ],
    guide: [
      { title: 'Open the item picker', instruction: 'In a real sale, start from Checkout. A tile is quickest; search or All products is useful when the tile is not visible.', button: 'Open Checkout in this practice preview', feedback: 'Good start. In the real POS, Checkout keeps the cart visible while you find items.' },
      { title: 'Choose the exact item', instruction: 'Pick the item and, if prompted, the correct variation. A scanner should only add an exact catalogue match.', button: 'Choose a catalogue item', feedback: 'The product is selected. Always confirm the variation when the picker asks.' },
      { title: 'Review the cart', instruction: 'Look at the item name, quantity and price. The practice preview does not change your real cart or charge a customer.', button: 'Confirm the cart entry', feedback: 'Item added to the practice cart. No live sale or payment was created.' },
    ],
    scenarios: [
      {
        id: 'smooth-add',
        kind: 'smooth',
        title: 'Everything matches',
        prompt: 'You tap a product tile and the right variation is shown in the cart. What should you do next?',
        choices: [
          { id: 'check', label: 'Check the item, variation, quantity and price before continuing.' },
          { id: 'charge', label: 'Charge immediately without checking the cart.' },
          { id: 'rescan', label: 'Scan the same item repeatedly to make sure it worked.' },
        ],
        answer: 'check',
        hints: ['Make sure the cart reflects what the customer is buying.', 'Verify the name, variation, quantity and price before payment.'],
      },
      {
        id: 'unknown-scan',
        kind: 'recovery',
        title: 'The scan is not recognised',
        prompt: 'The scanner reports no item for this code. What is the safest next step?',
        choices: [
          { id: 'search', label: 'Search the catalogue by SKU or name and confirm the exact item.' },
          { id: 'guess', label: 'Tap a similar-looking tile and assume it is the same product.' },
          { id: 'retry', label: 'Keep scanning the same code without checking the catalogue.' },
        ],
        answer: 'search',
        hints: ['An unknown code does not add anything. Do not guess a substitute.', 'Use Search or All products to find the correct catalogue item; check its SKU or name.'],
      },
    ],
    celebration: 'You can find items, confirm the cart and recover safely when a scan does not match.',
  },
];

export const learnerKey = (staffId?: string): string => staffId ?? 'register';
export const scenarioAnswerIsCorrect = (scenario: TrainingScenario, choiceId: string): boolean => choiceId === scenario.answer;
export const nextHintIndex = (hints: string[], current: number): number => Math.min(current + 1, hints.length);
