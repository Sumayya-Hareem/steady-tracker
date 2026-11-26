// Offline food parser: turns what you typed ("2 roti, daal, 1 egg, chai half sugar")
// into a rough calorie estimate. No network, no AI model, no account: just a small
// table of everyday Pakistani and common foods plus rules for quantities and units.
//
//   parseMeal('2 roti, daal, chai (half sugar)')
//     -> { items: [{ name: 'Roti', qty: 2, kcal: 220 }, ...], kcal: 439, unknown: [] }
//
// Honesty rules: numbers are ballpark home-portion values (good to roughly ±20-30%),
// and words the parser doesn't recognise are returned as `unknown` and are NOT counted.
// The app asks you to teach it (kcal per serving) rather than guessing silently.
// You can also type calories straight in: "restaurant biryani 650 kcal".

import { MEAL_KEYS, cleanCustomFoods } from './schema.js';

/* ------------------------------------------------------------------ *
 * Food table. One row = one food:
 *   id, display name, aliases ('|' separated), natural unit,
 *   grams (or ml) in one natural unit, kcal in one natural unit, extras.
 * `sugar` = kcal of sugar already included, so "no sugar" / "half sugar" can remove it.
 * ------------------------------------------------------------------ */
const f = (id, name, aliases, unit, grams, kcal, extra = {}) => ({ id, name, aliases: aliases.split('|'), unit, grams, kcal, ...extra });

export const FOODS = [
  // breads
  f('roti', 'Roti', 'roti|rotis|rotiyan|rotian|chapati|chapatis|chapatti|chapathi', 'piece', 45, 110),
  f('phulka', 'Phulka', 'phulka|phulkay|phulke|fulka|fulkay', 'piece', 35, 80),
  f('paratha', 'Paratha', 'paratha|parathas|parantha|paranthay|plain paratha|lachha paratha', 'piece', 80, 260),
  f('aloo paratha', 'Aloo paratha', 'aloo paratha|aloo parathas|aloo ka paratha|aloo parantha', 'piece', 130, 320),
  f('anda paratha', 'Egg paratha', 'anda paratha|egg paratha|anda parantha|anda ka paratha', 'piece', 120, 320),
  f('naan', 'Naan', 'naan|nan|naans|garlic naan|kulcha', 'piece', 90, 260),
  f('tandoori roti', 'Tandoori roti', 'tandoori roti|tandoori rotis|tandoor roti', 'piece', 90, 220),
  f('puri', 'Puri', 'puri|poori|puris|pooris', 'piece', 40, 150),
  f('bread', 'Bread slice', 'bread|toast|double roti|white bread|bread slice', 'piece', 28, 75),
  f('brown bread', 'Brown bread slice', 'brown bread|wholemeal bread|atta bread|whole wheat bread|multigrain bread', 'piece', 28, 70),
  f('rusk', 'Rusk', 'rusk|rusks|rus|cake rusk', 'piece', 15, 60),
  f('biscuit', 'Biscuit', 'biscuit|biscuits|biskut|biscut|bisket', 'piece', 10, 45),
  f('marie', 'Marie biscuit', 'marie|marie biscuit|marie biscuits|marry biscuit', 'piece', 8, 35),
  f('cream biscuit', 'Cream biscuit', 'cream biscuit|cream biscuits|oreo|oreos|sandwich biscuit|chocolate biscuit|choco biscuit', 'piece', 14, 65),

  // rice and one-plate meals
  f('rice', 'Rice', 'rice|chawal|chaawal|plain rice|boiled rice|safed chawal|steamed rice|white rice', 'katori', 150, 195),
  f('pulao', 'Pulao', 'pulao|pulaw|pulav|yakhni pulao|chicken pulao|beef pulao|matar pulao|peas pulao', 'plate', 300, 450),
  f('biryani', 'Biryani', 'biryani|biriyani|briyani|chicken biryani|beef biryani|mutton biryani|sindhi biryani', 'plate', 300, 500),
  f('daal chawal', 'Daal chawal', 'daal chawal|dal chawal|daal rice|dal rice|daal chaawal|dal chaawal', 'plate', 350, 430),
  f('khichdi', 'Khichdi', 'khichdi|khichri|khichadi|khichdee', 'plate', 300, 400),
  f('fried rice', 'Fried rice', 'fried rice|chinese rice|egg fried rice|chicken fried rice|egg rice', 'plate', 300, 450),
  f('oats', 'Oats (cooked)', 'oats|oatmeal|porridge|oat', 'bowl', 250, 220),
  f('cornflakes', 'Cornflakes with milk', 'cornflakes|corn flakes|cereal|cereals|muesli|chocos', 'bowl', 200, 200),
  f('dalia', 'Dalia', 'dalia|daliya|broken wheat|dalia porridge', 'bowl', 250, 190),
  f('pasta', 'Pasta', 'pasta|spaghetti|macaroni|penne|mac and cheese|baked pasta', 'plate', 250, 400),
  f('noodles', 'Noodles', 'noodles|noodle|maggi|instant noodles|ramen|chowmein|chow mein|chinese noodles', 'plate', 250, 380),

  // fast food and snacks
  f('sandwich', 'Sandwich', 'sandwich|sandwiches|club sandwich|chicken sandwich|egg sandwich|cheese sandwich|grilled sandwich|sandwhich', 'piece', 150, 330, { holder: true }),
  f('burger', 'Burger', 'burger|burgers|chicken burger|beef burger|patty burger|cheese burger|cheeseburger', 'piece', 200, 450, { holder: true }),
  f('zinger', 'Zinger burger', 'zinger|zinger burger|crispy burger|crunchy burger', 'piece', 230, 550, { holder: true }),
  f('shawarma', 'Shawarma', 'shawarma|shwarma|shawarmah|chicken shawarma|shawarma roll', 'piece', 250, 450, { holder: true }),
  f('roll', 'Roll / wrap', 'roll|rolls|chicken roll|paratha roll|kabab roll|tikka roll|chicken tikka roll|chicken paratha roll|zinger roll|zinger wrap|wrap|chicken wrap', 'piece', 200, 420, { holder: true }),
  f('pizza', 'Pizza slice', 'pizza|pizzas|chicken pizza|tikka pizza|fajita pizza|pizza slice', 'piece', 107, 280, { holder: true }),
  f('fries', 'Fries', 'fries|french fries|finger chips|potato fries|fry chips|masala fries|loaded fries', 'plate', 130, 400),
  f('nuggets', 'Chicken nuggets', 'nuggets|nugget|chicken nuggets|chicken nugget|chicken bites', 'piece', 20, 55),
  f('chicken strips', 'Chicken strips', 'chicken strips|chicken strip|strips|strip|crispy strips', 'piece', 40, 100),
  f('samosa', 'Samosa', 'samosa|samosay|samosas|aloo samosa|chicken samosa|keema samosa', 'piece', 80, 250),
  f('pakora', 'Pakora', 'pakora|pakoray|pakoras|pakoda|pakode|onion pakora|aloo pakora', 'piece', 30, 70),
  f('kachori', 'Kachori', 'kachori|kachoris|dal kachori|aloo kachori', 'piece', 70, 250),
  f('spring roll', 'Spring roll', 'spring roll|spring rolls|springroll|veg roll|egg roll', 'piece', 60, 150),
  f('golgappa', 'Golgappa', 'golgappa|golgappay|gol gappa|gol gappay|gol gappe|pani puri|panipuri|puchka|golgappe', 'piece', 20, 40),
  f('chaat', 'Chaat', 'chaat|chat|papri chaat|dahi bhalla|dahi baray|dahi bhallay|dahi bhaley|aloo chaat|chana chaat|bhalla papri|dahi puri|sev puri|bhel puri|bhel|samosa chaat|dahi papdi|papdi chaat', 'plate', 250, 300),
  f('fruit chaat', 'Fruit chaat', 'fruit chaat|fruit chat|fruit salad|fruits chaat', 'katori', 150, 110),
  f('halwa puri', 'Halwa puri nashta', 'halwa puri|halwa poori|puri halwa|halwa puri nashta|halwa puri chana', 'plate', 400, 700),
  f('aloo tikki', 'Aloo tikki', 'aloo tikki|aloo ki tikki|tikki|tikkis|potato cutlet|cutlet|cutlets|aloo cutlet', 'piece', 60, 130),
  f('papad', 'Papad', 'papad|papar|papadum|papads', 'piece', 15, 55),
  f('chips', 'Chips (small packet)', 'chips|lays|crisps|potato chips|wavy lays|chips packet|kurkure|snack packet|cheetos|pringles|doritos|nachos|potato crisps|slanty|crax|cheese balls', 'piece', 35, 180),
  f('namkeen', 'Namkeen', 'namkeen|nimko|nimko mix|mixture|bhujia|sev|chevda|dal moth|moth|mix namkeen|nimkee|namkeen mix', 'handful', 30, 150),
  f('popcorn', 'Popcorn', 'popcorn|pop corn|popcorns', 'bowl', 30, 150),

  // daals, beans, vegetables
  f('daal', 'Daal', 'daal|dal|dhal|daals|lentils|lentil|masoor|masoor daal|masoor dal|moong daal|moong dal|mong daal|arhar|arhar daal|toor daal|tarka daal|daal tarka|dal tarka', 'katori', 150, 140),
  f('daal mash', 'Daal mash', 'daal mash|dal mash|mash daal|mash dal|maash daal|maash ki daal|mash ki daal|urad daal', 'katori', 150, 160),
  f('daal chana', 'Daal chana', 'daal chana|dal chana|chana daal|chana dal|chanay ki daal|chane ki daal', 'katori', 150, 170),
  f('chana', 'Chana', 'chana|channa|chanay|channay|channe|chole|chickpeas|chickpea|chana salan|chana masala|chole masala|kabuli chana|boiled chana|chana curry|safed chana', 'katori', 150, 230),
  f('roasted chana', 'Roasted chana', 'roasted chana|bhuna chana|bhunay chanay|bhune chane|roasted chickpeas|chana roasted|bhuna channa|bhoona chana|bhunay chane|roasted channa|bhuna chanay', 'handful', 30, 110),
  f('lobia', 'Lobia', 'lobia|lobya|lobiya|black eyed beans|black eyed peas|chawli|lobia salan', 'katori', 150, 190),
  f('rajma', 'Rajma', 'rajma|rajmah|kidney beans|red beans|rajma salan', 'katori', 150, 200),
  f('sabzi', 'Sabzi', 'sabzi|sabji|subzi|sabzi curry|vegetable|vegetables|mix sabzi|mixed sabzi|mixed vegetable|mixed vegetables|mix veg|mixed veg|veg curry|vegetable curry|bhaji|tarkari|salan|curry|gravy', 'katori', 150, 120),
  f('aloo', 'Aloo', 'aloo|aaloo|aloo ki sabzi|aloo sabzi|aloo salan|aloo bhujia|potato curry|potato|potatoes|aloo tamatar', 'katori', 150, 160, { cutG: 40 }),
  f('aloo gobi', 'Aloo gobi', 'aloo gobi|aloo gobhi|gobi aloo|gobhi aloo', 'katori', 150, 140),
  f('aloo matar', 'Aloo matar', 'aloo matar|aloo mutter|matar aloo|aloo peas', 'katori', 150, 150),
  f('bhindi', 'Bhindi', 'bhindi|okra|bhindi masala|bhindi fry|bhindi sabzi', 'katori', 150, 130),
  f('saag', 'Saag / palak', 'saag|sarson ka saag|sarson saag|palak|spinach|palak saag|sag|palak sabzi|methi|methi sabzi', 'katori', 150, 150),
  f('baingan', 'Baingan', 'baingan|baigan|brinjal|eggplant|baingan bharta|bharta|baingan ka bharta|aubergine', 'katori', 150, 130),
  f('karela', 'Karela', 'karela|karelay|karele|bitter gourd|karela fry', 'katori', 150, 100),
  f('lauki', 'Lauki / gourds', 'lauki|ghia|tori|turai|tinda|tinday|lauki sabzi|tinde|arvi|kaddu ki sabzi|kaddu sabzi|kaddu ka salan|pumpkin sabzi|pumpkin curry', 'katori', 150, 90),
  f('gobi', 'Gobi', 'gobi|gobhi|cauliflower|phool gobi|phoolgobi|cabbage|band gobi|bandh gobi', 'katori', 150, 110),
  f('matar', 'Matar', 'matar|mutter|peas|green peas|matar masala', 'katori', 150, 130),
  f('paneer', 'Paneer', 'paneer|palak paneer|matar paneer|shahi paneer|paneer karahi|paneer curry|karahi paneer|paneer masala', 'katori', 150, 300),
  f('raita', 'Raita', 'raita|dahi raita|boondi raita|raita salad|pyaz raita|kheera raita|raitay|raite', 'katori', 150, 90),
  f('dahi', 'Dahi', 'dahi|yogurt|yoghurt|curd|plain dahi|dahee|dahi plain|plain yogurt|plain yoghurt|dahi bowl|curds', 'katori', 150, 100),
  f('soup', 'Soup', 'soup|soups|chicken soup|corn soup|chicken corn soup|hot and sour soup|vegetable soup|yakhni|shorba|shorbay|yakhni soup|hot sour soup|pumpkin soup|mushroom soup|tomato soup|carrot soup|broccoli soup|spinach soup|palak soup|lentil soup|daal soup|dal soup|mutton soup|beef soup|noodle soup|cream soup|cream of mushroom soup|cream of chicken soup|cream of tomato soup', 'bowl', 250, 120),
  f('salad', 'Salad', 'salad|salads|green salad|kachumber|kachoomar|vegetable salad|salad plate|raw salad|mixed salad|sirka pyaz|veg salad', 'bowl', 150, 35),
  f('cucumber', 'Cucumber', 'cucumber|kheera|kheeray|kheere|kakri|cucumbers', 'piece', 150, 25),
  f('tomato', 'Tomato', 'tomato|tomatoes|tamatar|tamater|tamatay', 'piece', 100, 20),
  f('onion', 'Onion', 'onion|onions|pyaz|pyaaz', 'piece', 80, 35),
  f('carrot', 'Carrot', 'carrot|carrots|gajar|gajjar', 'piece', 70, 30, { cutG: 25, kind: 'veg' }),
  f('radish', 'Radish', 'radish|mooli|muli|moolee', 'piece', 60, 10),
  // side vegetables: one "serving" is a small side portion (about 80-100 g), and a cut piece is about 20 g
  f('roast veg', 'Roasted vegetables', 'roasted vegetables|roasted vegetable|roasted veggies|roasted veggie|roasted veg|roast vegetables|roast veggies|roast veg|grilled vegetables|grilled veggies|grilled veg|fried vegetables|fried veggies|fried veg|baked vegetables|baked veggies|baked veg|sauteed vegetables|sauteed veggies|stir fry vegetables|stir fried vegetables|veggies|veggie|mixed veggies|side veggies|side vegetables|veggie platter|vegetable platter|platter vegetables|platter veggies', 'serving', 100, 80, { cutG: 20, kind: 'vegmix' }),
  f('steamed veg', 'Steamed vegetables', 'steamed vegetables|steamed vegetable|steamed veggies|steamed veg|boiled vegetables|boiled vegetable|boiled veggies|boiled veg|blanched vegetables', 'serving', 100, 40, { cutG: 20, kind: 'vegmix' }),
  f('pumpkin', 'Pumpkin', 'pumpkin|pumpkins|kaddu|butternut|butternut squash|squash', 'serving', 80, 50, { cutG: 20, kind: 'veg' }),
  f('zucchini', 'Zucchini', 'zucchini|zucchinis|courgette|courgettes', 'serving', 80, 45, { cutG: 20, kind: 'veg' }),
  f('broccoli', 'Broccoli', 'broccoli|brocoli|broccolli|broccoli florets', 'serving', 80, 45, { cutG: 20, kind: 'veg' }),
  f('asparagus', 'Asparagus', 'asparagus|asparagus spears', 'serving', 80, 45, { cutG: 18, kind: 'veg' }),
  f('green beans', 'Green beans', 'green beans|green bean|french beans|french bean|string beans|fansi|beans', 'serving', 80, 45, { cutG: 8, kind: 'veg' }),
  f('capsicum', 'Capsicum', 'capsicum|capsicums|shimla mirch|bell pepper|bell peppers', 'serving', 80, 40, { cutG: 20, kind: 'veg' }),
  f('mushroom', 'Mushroom', 'mushroom|mushrooms|khumb', 'serving', 80, 45, { cutG: 15, kind: 'veg' }),
  f('beetroot', 'Beetroot', 'beetroot|beetroots|chukandar|beets|beet', 'serving', 80, 50, { cutG: 25, kind: 'veg' }),
  f('corn', 'Corn on the cob', 'corn|bhutta|makai|sweet corn|corn cob|boiled corn|roasted corn|bhutta roasted|makka', 'piece', 150, 130),
  f('makai roti', 'Makai / bajra roti', 'makai ki roti|makki ki roti|makai roti|makki roti|corn roti|bajra roti|bajre ki roti|jowar roti|jawar roti|bajra', 'piece', 60, 140),
  f('boiled potato', 'Boiled potato', 'boiled potato|potato boiled|aloo ubla|ubla aloo|aloo boiled|boiled aloo|ubla hua aloo|baked potato', 'piece', 150, 130, { cutG: 40 }),
  f('sweet potato', 'Sweet potato', 'sweet potato|shakarkandi|shakar qandi|shakarkandi roasted|sweet potato boiled|roasted sweet potato', 'piece', 150, 130, { cutG: 40, kind: 'veg' }),
  f('achar', 'Achar', 'achar|pickle|achaar|aachar|pickles|mango pickle|lime pickle', 'tbsp', 15, 40),
  f('chutney', 'Chutney', 'chutney|chatni|imli chutney|hari chutney|green chutney|podina chutney|tamarind chutney|chutni', 'tbsp', 15, 15),
  f('ketchup', 'Ketchup', 'ketchup|tomato ketchup|catsup|tomato sauce|chili sauce|hot sauce|chilli sauce|garlic sauce', 'tbsp', 17, 20),

  // meat, fish, eggs
  f('butter chicken', 'Butter chicken', 'butter chicken|chicken makhni|chicken makhani|makhni chicken|murgh makhani', 'piece', 120, 250),
  f('chicken salad', 'Chicken salad', 'chicken salad|grilled chicken salad|tikka salad', 'plate', 250, 280),
  f('chicken', 'Chicken curry', 'chicken|chicken curry|chicken salan|chicken masala|murgh|murghi|chicken ka salan|chicken handi|chicken shorba|chicken gravy|chicken pieces|chicken piece|desi chicken|murgh salan', 'piece', 120, 190),
  f('chicken karahi', 'Chicken karahi', 'chicken karahi|karahi|chicken kadai|kadhai chicken|chicken kadhai|karahi chicken|chicken karhai|karhai|white karahi|chicken white karahi', 'piece', 130, 260),
  f('chicken korma', 'Chicken korma', 'chicken korma|korma|chicken qorma|qorma|chicken white korma', 'piece', 130, 280),
  f('fried chicken', 'Fried chicken', 'fried chicken|broast|chicken broast|crispy chicken|chicken fry|fry chicken|fried chicken piece|krispy chicken|chicken fried', 'piece', 100, 280),
  f('grilled chicken', 'Grilled chicken / tikka', 'grilled chicken|chicken tikka|chicken boti|bbq chicken|tikka|chicken bbq|chicken malai boti|malai boti|chicken grill|tandoori chicken|chicken tandoori|chicken leg piece|roasted chicken|roast chicken|chicken roast|chicken roasted|oven chicken|oven roasted chicken|baked chicken|chicken baked', 'piece', 100, 170),
  f('boiled chicken', 'Chicken breast', 'boiled chicken|chicken boiled|chicken breast|grilled chicken breast|chicken shredded|shredded chicken|roasted chicken breast|baked chicken breast|oven chicken breast|chicken breast roasted', 'piece', 100, 165),
  f('steak', 'Steak', 'steak|steaks|beef steak|ribeye|rib eye|sirloin|tenderloin|fillet steak|grilled steak', 'piece', 200, 400),
  f('chicken steak', 'Chicken steak', 'chicken steak|chicken steaks|steak chicken', 'piece', 180, 300),
  f('seekh kabab', 'Seekh kabab', 'seekh kabab|seekh kebab|seekh kababs|seekh|kabab|kebab|kababs|kebabs|chicken kabab|beef kabab|reshmi kabab|reshmi kebab|gola kabab|boti kabab', 'piece', 50, 120),
  f('shami kabab', 'Shami kabab', 'shami kabab|shami|shami kebab|shami kababs|shamis|chicken shami', 'piece', 45, 100),
  f('chapli kabab', 'Chapli kabab', 'chapli kabab|chapli|chapli kebab|chapli kababs', 'piece', 110, 260),
  f('bun kabab', 'Bun kabab', 'bun kabab|bun kebab|anda shami burger|shami burger|bun kababs', 'piece', 180, 380),
  f('mutton', 'Mutton / beef curry', 'mutton|gosht|beef|beef curry|mutton curry|gosht salan|aloo gosht|beef salan|mutton karahi|mutton handi|daal gosht|lamb|mutton salan|beef karahi|beef handi|gosht karahi|mutton korma|beef korma', 'piece', 120, 250),
  f('qeema', 'Qeema', 'qeema|keema|mince|qeema matar|keema matar|qeema curry|keema curry|qeema aloo|keema aloo|minced meat', 'katori', 150, 300),
  f('nihari', 'Nihari', 'nihari|nehari|beef nihari|nalli nihari', 'katori', 150, 300),
  f('haleem', 'Haleem', 'haleem|daleem|chicken haleem|beef haleem', 'katori', 150, 250),
  f('paya', 'Paya', 'paya|paye|siri paye|siri paya|paaye|trotters', 'katori', 150, 280),
  f('fish', 'Fish', 'fish|machli|machhli|fish fry|fried fish|fish curry|grilled fish|fish tikka|fish fillet|fish finger', 'piece', 100, 200),
  f('egg', 'Egg (boiled)', 'egg|eggs|anda|ande|anday|andey|boiled egg|boiled eggs|ubla anda|ubla hua anda|hard boiled egg|anda ubla|ubly ande|ubla ande|hardboiled egg', 'piece', 50, 78),
  f('fried egg', 'Fried egg', 'fried egg|fried eggs|egg fry|anda fry|half fry|half fry egg|sunny side up|eggs fry|anda fried', 'piece', 46, 100),
  f('omelette', 'Omelette (1 egg)', 'omelette|omelet|omlet|omlette|egg omelette|anda omelette|egg omelet|anda ka omlet|omelettes|omlets|omelete', 'piece', 70, 120),
  f('egg bhurji', 'Egg bhurji (1 egg)', 'egg bhurji|anda bhurji|bhurji|scrambled egg|scrambled eggs|egg scramble|anda scramble|egg burji|anda burji|burji', 'piece', 70, 125),
  f('egg white', 'Egg white', 'egg white|egg whites|anday ki safedi|safedi', 'piece', 33, 17),

  // dairy, drinks
  f('doodh', 'Milk (full cream)', 'doodh|dudh|milk|full cream milk|glass milk|garam doodh|hot milk|cold milk|haldi doodh|turmeric milk|haldi wala doodh|doodh glass|whole milk|packet milk', 'glass', 250, 170),
  f('low fat milk', 'Milk (low fat)', 'low fat milk|skim milk|skimmed milk|toned milk|lite milk|low fat doodh|olpers lite|half cream milk', 'glass', 250, 110),
  f('lassi', 'Lassi (sweet)', 'lassi|sweet lassi|meethi lassi|lassi meethi|lasi|sweet lasi', 'glass', 250, 180, { sugar: 60 }),
  f('namkeen lassi', 'Salted lassi / chaas', 'namkeen lassi|salted lassi|salty lassi|lassi namkeen|chaas|chaach|chhaas|butter milk|buttermilk|namkeen chaas|namkeen lasi', 'glass', 250, 70),
  f('chai', 'Chai (milk tea)', 'chai|chay|chaye|tea|doodh patti|doodh patti chai|milk tea|karak chai|karak|adrak chai|elaichi chai|masala chai|cutting chai|dudh patti|chai ka cup|special chai|chai patti|dhoodh patti', 'cup', 150, 95, { sugar: 32 }),
  f('black tea', 'Black tea', 'black tea|sada chai|plain tea|kali chai|lemon tea|sulemani chai|sulemani|sada chay|black chai|kali chay', 'cup', 150, 3),
  f('green tea', 'Green tea', 'green tea|greentea|green chai|qehwa|kahwa|kehwa|herbal tea|saunf tea|jasmine tea', 'cup', 150, 2),
  f('coffee', 'Coffee with milk', 'coffee|coffe|nescafe|cappuccino|latte|milk coffee|hot coffee|caramel latte|mocha', 'cup', 200, 100, { sugar: 32 }),
  f('cold coffee', 'Cold coffee', 'cold coffee|iced coffee|iced latte|frappe|frappuccino', 'glass', 300, 260, { sugar: 60 }),
  f('black coffee', 'Black coffee', 'black coffee|americano|espresso|coffee black', 'cup', 200, 5),
  f('water', 'Water', 'water|pani|paani|plain water|mineral water|soda water|ice water|thanda pani|garam pani|warm water', 'glass', 250, 0),
  f('cola', 'Cola / soft drink', 'cola|coke|coca cola|pepsi|sprite|7up|seven up|fanta|mirinda|mountain dew|soft drink|cold drink|soda|limca|energy drink|redbull|red bull|sting|cold drinks|soft drinks', 'glass', 250, 105),
  f('juice', 'Juice', 'juice|fresh juice|orange juice|fruit juice|apple juice|mango juice|pineapple juice|packed juice|guava juice|pomegranate juice|anar juice|juices|juice glass', 'glass', 250, 120),
  f('sugarcane juice', 'Sugarcane juice', 'sugarcane juice|ganne ka juice|gannay ka juice|ganne ka ras|sugar cane juice|ganna juice|ganay ka ras|gannay ka ras|ganne ka rus', 'glass', 250, 180),
  f('nimbu pani', 'Nimbu pani', 'nimbu pani|nimbu paani|lemonade|lemon water|shikanji|limu pani|lemon soda|nimbu soda|nimbu sharbat', 'glass', 250, 70, { sugar: 60 }),
  f('sharbat', 'Sharbat / Rooh Afza', 'sharbat|rooh afza|roohafza|rooh afza milk|sandal sharbat|sharbat glass|sharbat sandal|kewra sharbat|falsa sharbat|bael sharbat', 'glass', 250, 130),
  f('milkshake', 'Milkshake', 'milkshake|milk shake|shake|banana shake|mango shake|chocolate shake|oreo shake|shakes|strawberry shake|date shake', 'glass', 300, 300, { holder: true }),

  // sweets and desserts
  f('kheer', 'Kheer', 'kheer|kheeer|rice pudding|phirni|firni|zarda|meethe chawal', 'katori', 150, 230),
  f('halwa', 'Halwa', 'halwa|suji halwa|sooji halwa|gajar halwa|gajar ka halwa|carrot halwa|sheera|semolina halwa|halwa suji|halwa sooji|aata halwa', 'katori', 120, 330),
  f('gulab jamun', 'Gulab jamun', 'gulab jamun|gulab jaman|gulabjamun|gulab jamman|jamun gulab|gulab jamuns', 'piece', 50, 150),
  f('jalebi', 'Jalebi', 'jalebi|jalebis|jilebi|imarti', 'piece', 40, 150),
  f('mithai', 'Mithai (1 piece)', 'mithai|mithaai|sweets|barfi|burfi|peda|pera|cham cham|chum chum|kalakand|sohan halwa', 'piece', 40, 150),
  f('laddu', 'Laddu', 'laddu|ladoo|laddoo|motichoor|motichoor laddu|besan laddu|laddus|ladu', 'piece', 40, 180),
  f('rasmalai', 'Rasmalai / rasgulla', 'rasmalai|ras malai|rasgulla|ras gulla|rasgulle|rasgullay', 'piece', 70, 150),
  f('ice cream', 'Ice cream (1 scoop)', 'ice cream|icecream|kulfi|gelato|ice creams|ice cream cone|cone ice cream', 'piece', 70, 140),
  f('cake', 'Cake / pastry', 'cake|cake slice|pastry|pastries|cream pastry|fruit pastry|sponge cake|slice cake|chocolate cake|vanilla cake|cakes|pound cake|cheesecake|cheese cake', 'piece', 80, 300),
  f('donut', 'Donut', 'donut|doughnut|donuts|doughnuts|dunkin donut', 'piece', 60, 250),
  f('brownie', 'Brownie', 'brownie|brownies', 'piece', 60, 260),
  f('cupcake', 'Cupcake / muffin', 'cupcake|cup cake|muffin|muffins|cupcakes', 'piece', 70, 260),
  f('chocolate', 'Chocolate', 'chocolate|chocolates|choclate|cadbury|dairy milk|kitkat|kit kat|snickers|galaxy|bounty|chocolate bar|twix|mars|chocolate piece|choco|toblerone', 'piece', 40, 210),
  f('toffee', 'Toffee / candy', 'toffee|toffees|candy|candies|lollipop|lolly|gum drop|hard candy|chocolate toffee|eclair|eclairs|mentos|polo', 'piece', 8, 35),

  // nuts and dry fruit
  f('peanuts', 'Peanuts', 'peanuts|peanut|moongphali|mungphali|moong phali|groundnuts|roasted peanuts|mungfali|mongphali|mumphali|moongfali', 'handful', 30, 170),
  f('nuts', 'Mixed nuts', 'nuts|mixed nuts|dry fruits|dry fruit|dryfruits|mix nuts|mewa|meva|trail mix|nuts handful|mix dry fruit|dryfruit', 'handful', 30, 175),
  f('almonds', 'Almonds', 'almonds|almond|badam|badaam|bhigay badam|soaked almonds', 'piece', 1.2, 7),
  f('walnuts', 'Walnuts', 'walnuts|walnut|akhrot|akhrut|akhroat', 'piece', 5, 33),
  f('cashews', 'Cashews', 'cashews|cashew|kaju|kajoo|cashew nuts', 'piece', 1.6, 9),
  f('pistachios', 'Pistachios', 'pistachios|pistachio|pista|pistay', 'piece', 0.8, 4),
  f('raisins', 'Raisins', 'raisins|raisin|kishmish|kismis|sultana|sultanas', 'handful', 30, 90),
  f('dates', 'Dates', 'dates|date fruit|khajoor|khajur|khajuur|dried dates|chuhara|chhuara|khurma|ajwa|ajwa dates', 'piece', 8, 25),

  // fats, spreads, sugar
  f('ghee', 'Ghee', 'ghee|desi ghee|clarified butter', 'tsp', 5, 45),
  f('butter', 'Butter', 'butter|makhan|makkhan|makhaan|butter slice|desi butter|white butter', 'tsp', 5, 36),
  f('oil', 'Cooking oil', 'oil|tel|cooking oil|olive oil|mustard oil|sarson ka tel|fry oil|sunflower oil|canola oil|oil spoon|coconut oil', 'tsp', 5, 40),
  f('cream', 'Cream / malai', 'cream|malai|fresh cream|whipped cream|cream topping|dairy cream', 'tbsp', 15, 50),
  f('cheese', 'Cheese', 'cheese|cheese slice|cheddar|mozzarella|cheese slices|cheese cube|pizza cheese|processed cheese', 'piece', 20, 70),
  f('mayo', 'Mayonnaise', 'mayo|mayonnaise|garlic mayo|mayo sauce|mayones|mayonaise', 'tbsp', 15, 95),
  f('peanut butter', 'Peanut butter', 'peanut butter|pb|peanutbutter', 'tbsp', 16, 95),
  f('nutella', 'Chocolate spread', 'nutella|chocolate spread|choco spread|spread|hazelnut spread|nutela', 'tbsp', 18, 95),
  f('jam', 'Jam', 'jam|jelly|murabba|marmalade|fruit jam|mixed fruit jam|jam spread', 'tsp', 7, 19),
  f('honey', 'Honey', 'honey|shehad|shahad|shehed|shahd', 'tsp', 7, 21),
  f('sugar', 'Sugar', 'sugar|cheeni|chini|shakkar|shakar|gur|jaggery|brown sugar|misri|gud', 'tsp', 4, 16),

  // fruit
  f('apple', 'Apple', 'apple|apples|saib|seb', 'piece', 180, 95),
  f('banana', 'Banana', 'banana|bananas|kela|kele|kaila', 'piece', 120, 105),
  f('orange', 'Orange / kinnow', 'orange|oranges|malta|kinnow|kinno|santra|mosambi|mausami|sangtra|tangerine|mandarin|kinow|kino', 'piece', 130, 60),
  f('guava', 'Guava', 'guava|guavas|amrood|amrud|amroud|amrod|amrut', 'piece', 130, 85),
  f('mango', 'Mango', 'mango|mangoes|mangos|aam|aamm|chaunsa|sindhri|anwar ratol|langra|dussehri', 'piece', 200, 120),
  f('grapes', 'Grapes', 'grapes|grape|angoor|angur', 'cup', 150, 100),
  f('watermelon', 'Watermelon (slice)', 'watermelon|tarbooz|tarbuz|water melon', 'piece', 250, 75),
  f('melon', 'Melon (slice)', 'melon|kharbooza|kharbuza|cantaloupe|garma|sarda|honeydew', 'piece', 150, 50),
  f('pomegranate', 'Pomegranate', 'pomegranate|anar|anaar|anar dana|pomegranate seeds', 'katori', 150, 125),
  f('papaya', 'Papaya', 'papaya|papita|paapita|pawpaw', 'katori', 150, 65),
  f('pear', 'Pear', 'pear|nashpati|nashpaati|nashpatti|pears', 'piece', 180, 100),
  f('peach', 'Peach', 'peach|aaru|aru|aadu|adu|peaches|nectarine', 'piece', 150, 60),
  f('plum', 'Plum', 'plum|aloo bukhara|alubukhara|alu bukhara|plums|aloobukhara', 'piece', 70, 30),
  f('apricot', 'Apricot', 'apricot|khubani|khobani|apricots|khubaani', 'piece', 35, 17),
  f('strawberry', 'Strawberries', 'strawberry|strawberries', 'cup', 150, 50),
  f('chikoo', 'Chikoo', 'chikoo|chiku|sapodilla|chikku|chickoo', 'piece', 100, 85),
  f('kiwi', 'Kiwi', 'kiwi|kiwis|kiwi fruit', 'piece', 75, 45),
  f('pineapple', 'Pineapple (slice)', 'pineapple|ananas|pine apple', 'piece', 80, 40),
  f('jamun', 'Jamun (berries)', 'jamun|jaman|jamun fruit|black plum', 'handful', 30, 18),
  f('coconut', 'Coconut', 'coconut|nariyal|naryal|coconut piece|kopra|fresh coconut', 'piece', 45, 160),
];

// "None today", "skipped": counts as logged, adds nothing.
const NOTHING = { id: 'nothing', name: 'Nothing', unit: 'serving', grams: null, kcal: 0 };
const NOTHING_WORDS = ['none', 'nothing', 'nil', 'skipped', 'skip', 'fasting', 'nahi', 'nhi'];

/* ------------------------------------------------------------------ *
 * Vocabulary
 * ------------------------------------------------------------------ */

const NUMBER_WORDS = {
  a: 1, an: 1, ek: 1, aik: 1, one: 1, do: 2, two: 2, teen: 3, three: 3, char: 4, chaar: 4, four: 4,
  paanch: 5, panch: 5, five: 5, chhe: 6, chay: 6, che: 6, six: 6, saat: 7, seven: 7, aath: 8, eight: 8,
  nau: 9, nine: 9, das: 10, ten: 10, half: 0.5, adha: 0.5, aadha: 0.5, adhi: 0.5, aadhi: 0.5,
  quarter: 0.25, paon: 0.25, dedh: 1.5, dhai: 2.5, dhaai: 2.5, sawa: 1.25, couple: 2, few: 3, several: 4,
};

const UNIT_ALIASES = {
  piece: 'piece pieces pc pcs slice slices scoop scoops cone cones packet packets pack pkt bar bars cob',
  katori: 'katori katoris katory',
  bowl: 'bowl bowls',
  plate: 'plate plates',
  cup: 'cup cups piyala pyala',
  glass: 'glass glasses gilas glas',
  tbsp: 'tbsp tablespoon tablespoons',
  tsp: 'tsp teaspoon teaspoons',
  spoon: 'spoon spoons chamach chamcha chammach chamche',
  handful: 'handful handfuls mutthi muthi musht',
  g: 'g gm gms gram grams gr',
  kg: 'kg kgs kilo kilos',
  ml: 'ml mls',
  l: 'l lt ltr litre liter litres liters',
  can: 'can cans',
  bottle: 'bottle bottles',
  cut: 'cube cubes chunk chunks floret florets spear spears sliver slivers wedge wedges',
  serving: 'serving servings portion portions',
  kcal: 'kcal kcals cal cals calorie calories kilocalories',
};
const UNIT_LOOKUP = new Map();
for (const [unit, words] of Object.entries(UNIT_ALIASES)) for (const w of words.split(' ')) UNIT_LOOKUP.set(w, unit);
const NEEDS_NUMBER = new Set(['g', 'kg', 'ml', 'l', 'kcal']);

// grams (or ml) in one of these when it differs from the food's natural unit
const GENERIC_G = { katori: 150, bowl: 250, plate: 300, cup: 180, glass: 250, tbsp: 15, tsp: 5, spoon: 15, handful: 30, can: 330, bottle: 345, g: 1, kg: 1000, ml: 1, l: 1000 };

const SIZE_WORDS = {
  small: 0.75, chota: 0.75, chhota: 0.75, chotta: 0.75, choti: 0.75, chhoti: 0.75, mini: 0.75,
  large: 1.4, big: 1.4, bara: 1.4, bada: 1.4, badi: 1.4, bari: 1.4, jumbo: 1.4,
  medium: 1, normal: 1, regular: 1, darmiyana: 1, full: 1, whole: 1,
  thora: 0.35, thoda: 0.35, thori: 0.35, little: 0.35, bit: 0.35, tiny: 0.12, taste: 0.12, bite: 0.12, bites: 0.12, nibble: 0.12, extra: 1.5, double: 2, twice: 2, dugna: 2, dugni: 2,
};

const DRINK_UNITS = new Set(['cup', 'glass', 'can', 'bottle']); // a drink beside a burger is a drink, not its filling
const NO_WORDS = new Set(['no', 'without', 'bina']);
const LESS_WORDS = new Set(['half', 'less', 'kam', 'thori', 'thora', 'thoda', 'adha', 'aadha', 'adhi', 'aadhi', 'low', 'little', 'light']);
const SUGAR_WORDS = new Set(['sugar', 'cheeni', 'chini', 'meetha', 'meethi', 'shakar', 'shakkar', 'sweet', 'sweetener']);
const FAT_WORDS = new Set(['oil', 'tel', 'ghee', 'butter', 'makhan']);

// words that split one item from the next
const SEPARATORS = new Set(['with', 'and', 'aur', 'plus', 'saath', 'sath', 'also', 'then']);
// words that carry no calories and are skipped (so "I had 2 roti for lunch today" just works)
const FILLER = new Set(('a an of ka ki ke ko wala wali wale se like just only the some my mine i had ate eaten eat took have drank drink '
  + 'khaya khayi khaye kha liya li piya pi piyi tha thi today tonight aaj raat subah dopahar morning evening afternoon breakfast lunch dinner '
  + 'supper snack snacks meal meals nashta nashte khana khane at in on for to from about around approx approximately roughly fresh homemade home '
  + 'made hot cold spicy plain tasty yummy delicious good boiled fried grilled roasted steamed baked cooked raw simple heavy ghar bahar bazaar '
  + 'hotel restaurant dhaba kafi bahut bohat zyada more less no without bina low light sweet too much very really lot lots many overate '
  + 'crispy crunchy juicy creamy cheesy sour salty bitter classic original special deluxe supreme mixed assorted signature '
  + 'sa si sii thing things stuff etc wagera waghera vagera chopped sliced diced cut').split(' '));

/* ------------------------------------------------------------------ *
 * Tokenising and matching
 * ------------------------------------------------------------------ */

// Order matters: a range ("2-3", "2 to 3") first, then fractions, numbers (with glued units), words, commas.
// Anything else (brackets, quotes, stray hyphens and dots) is simply skipped.
const TOKEN_RE = /\d+(?:\.\d+)?\s*(?:-|–|—|to)\s*\d+(?:\.\d+)?|\d+\/\d+|\d+(?:\.\d+)?\p{L}*|\p{L}[\p{L}'’`]*\d*|[½¼¾⅓⅔]|,/gu;
const FRACTION_CHARS = { '½': '1/2', '¼': '1/4', '¾': '3/4', '⅓': '1/3', '⅔': '2/3' };

/** Tokens plus the [start, end) position of each one in the typed text (null if the text can't be mapped back). */
function lex(text) {
  const raw = String(text ?? '');
  const low = raw.toLowerCase();
  const tokens = [];
  const spans = [];
  for (const m of low.replace(/[+&|\n\r;]/g, ',').matchAll(TOKEN_RE)) { // hard separators become commas, same length
    let t = m[0];
    const range = /^(\d+(?:\.\d+)?)\s*(?:-|–|—|to)\s*(\d+(?:\.\d+)?)$/.exec(t);
    if (range) t = `${range[1]}-${range[2]}`;
    else if (FRACTION_CHARS[t]) t = FRACTION_CHARS[t];
    else t = t.replace(/['’`]/g, ''); // didn't -> didnt
    tokens.push(t);
    spans.push([m.index, m.index + m[0].length]);
  }
  return { tokens, spans: low.length === raw.length ? spans : null };
}

export function tokenize(text) {
  return lex(text).tokens;
}

const keyOf = (alias) => tokenize(alias).join(' ');

/** "2roti" -> "2", "roti" (but keep "100g", "2pcs" and brand-like names such as "7up" whole). */
function splitGlued({ tokens, spans }) {
  const outTokens = [];
  const outSpans = spans ? [] : null;
  tokens.forEach((t, k) => {
    const m = /^(\d+(?:\.\d+)?)(\p{L}+)$/u.exec(t);
    if (!m || UNIT_LOOKUP.has(m[2]) || /^x$/.test(m[2]) || BUILTIN.has(t)) {
      outTokens.push(t);
      outSpans?.push(spans[k]);
      return;
    }
    outTokens.push(m[1], m[2]);
    if (outSpans) {
      const cut = spans[k][0] + m[1].length;
      outSpans.push([spans[k][0], cut], [cut, spans[k][1]]);
    }
  });
  return { tokens: outTokens, spans: outSpans };
}
const singular = (key) => (key.length > 3 && key.endsWith('s') && !key.endsWith('ss') ? key.slice(0, -1) : key);

const BUILTIN = new Map(); // alias key -> food
let BUILTIN_MAX = 1;
for (const food of FOODS) {
  for (const alias of food.aliases) {
    const key = keyOf(alias);
    if (!key) continue;
    BUILTIN.set(key, food);
    BUILTIN_MAX = Math.max(BUILTIN_MAX, key.split(' ').length);
  }
}
for (const w of NOTHING_WORDS) BUILTIN.set(w, NOTHING);

/** Foods you taught the app behave like built-ins and win ties. */
function buildIndex(custom) {
  const map = new Map();
  let max = BUILTIN_MAX;
  for (const c of cleanCustomFoods(custom)) {
    const key = keyOf(c.name);
    if (!key) continue;
    map.set(key, { id: `custom:${key}`, name: c.name, unit: 'serving', grams: null, kcal: c.kcal, custom: true });
    max = Math.max(max, key.split(' ').length);
  }
  return {
    custom: map,
    max,
    get: (key) => map.get(key) ?? BUILTIN.get(key),
    singles: () => [...BUILTIN.entries(), ...map.entries()].filter(([k]) => !k.includes(' ')),
  };
}

function matchAlias(tokens, i, idx) {
  for (let len = Math.min(idx.max, tokens.length - i); len >= 1; len--) {
    const key = tokens.slice(i, i + len).join(' ');
    if (key.includes(',')) continue;
    const hit = idx.get(key) ?? idx.get(singular(key));
    if (hit) return { food: hit, len };
  }
  return null;
}

// Bounded Levenshtein: returns max+1 as soon as the distance is certain to exceed `max`.
function distance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/**
 * Typo tolerance for single words: "chiken" -> "chicken". Returns the corrected alias key
 * (so "chiken karahi" can still match the two-word dish). The first letter must match and
 * ambiguous matches are rejected, to keep ordinary words from turning into foods.
 */
function fuzzyKey(token, idx) {
  if (token.length < 5 || /\d/.test(token) || token.endsWith('y')) return null; // -y words are adjectives (crispy, juicy)
  const max = token.length >= 9 ? 2 : 1;
  let found = null;
  let foundKey = null;
  for (const [key, food] of idx.singles()) {
    if (key[0] !== token[0] || key.length < 4 || distance(token, key, max) > max) continue;
    if (found && found.id !== food.id) return null;
    found = food;
    foundKey = key;
  }
  return foundKey;
}

const frac = (t) => {
  const [n, d] = t.split('/').map(Number);
  return d ? n / d : 0;
};

function readNumber(tokens, i, hasQty) {
  const t = tokens[i];
  let m;
  if ((m = /^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/.exec(t))) return { value: (Number(m[1]) + Number(m[2])) / 2, len: 1 }; // "2-3 pieces" ~ 2.5
  if (/^\d+(?:\.\d+)?$/.test(t)) {
    const next = tokens[i + 1];
    if (next && /^\d+\/\d+$/.test(next)) return { value: Number(t) + frac(next), len: 2 }; // "1 1/2"
    return { value: Number(t), len: 1 };
  }
  if (/^\d+\/\d+$/.test(t)) return { value: frac(t), len: 1 };
  if ((m = /^x(\d+(?:\.\d+)?)$/.exec(t)) || (m = /^(\d+(?:\.\d+)?)x$/.exec(t))) return { value: Number(m[1]), len: 1 };
  if ((m = /^(\d+(?:\.\d+)?)(\p{L}+)$/u.exec(t)) && UNIT_LOOKUP.has(m[2])) return { value: Number(m[1]), unit: UNIT_LOOKUP.get(m[2]), len: 1 }; // "100g", "2pcs"
  if (Object.hasOwn(NUMBER_WORDS, t)) {
    if ((t === 'a' || t === 'an') && hasQty) return null;
    return { value: NUMBER_WORDS[t], len: 1 };
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * Pricing one item
 * ------------------------------------------------------------------ */

const sameUnit = (natural, unit) => unit === natural || (unit === 'spoon' && (natural === 'tsp' || natural === 'tbsp'));

const DEFAULT_CUT_G = 20; // one small cut piece or cube

function servingsFor(food, qty, unit) {
  if (unit === 'cut') return food.grams ? (qty * (food.cutG ?? DEFAULT_CUT_G)) / food.grams : qty;
  if (!unit || sameUnit(food.unit, unit) || !food.grams) return qty;
  const g = GENERIC_G[unit];
  return g ? (qty * g) / food.grams : qty;
}

function price(item) {
  if (item.explicit != null) return Math.round(item.explicit);
  if (!item.food) return null;
  const { food } = item;
  const perServing = food.kcal - (food.sugar ?? 0) * (1 - item.sugarKeep);
  return Math.round(servingsFor(food, item.qty, item.unit) * item.size * perServing);
}

/** "2 × Roti", "1 plate Rice", "Daal" — what to show for an item. */
export function itemLabel(item) {
  const q = Number.isInteger(item.qty) ? item.qty : Number(item.qty.toFixed(2));
  if (item.explicit != null) return item.name;
  if (item.unit === 'cut') return `${q} ${q === 1 ? 'piece' : 'pieces'} of ${item.name}`;
  if (item.unit && item.unit !== 'piece' && item.unit !== 'serving') return `${q} ${item.unit} ${item.name}`;
  return q === 1 ? item.name : `${q} × ${item.name}`;
}

/* ------------------------------------------------------------------ *
 * parseMeal
 * ------------------------------------------------------------------ */

const LIQUID_UNITS = new Set(['cup', 'glass', 'can', 'bottle']);

/**
 * "2 pieces of carrot" means cut pieces, not two whole carrots, and "3 pumpkin" means three
 * pieces, not three servings. Only foods that carry a `cutG` (a cut piece's weight) are touched.
 */
function cutIfPieces(item, { bare = false } = {}) {
  const food = item.food;
  if (!food?.cutG) return;
  if (item.unit === 'piece') item.unit = 'cut';
  else if (bare && !item.unit && food.unit === 'serving' && item.qty >= 1) item.unit = 'cut';
}

/**
 * Parse one meal's text. Returns { items, kcal, unknown }.
 * Each item: { name, qty, unit, kcal, id, unknown, custom, explicit, rough, usual, per, span, nameSpan }.
 * `kcal` counts only items whose calories are known; `unknown` lists the rest.
 * `rough` = no amount was typed (so one usual serving was assumed); `usual` = kcal of that serving;
 * `span` / `nameSpan` = where the item (with its amount) and just its name sit in the typed text,
 * which is what rewriteItem() and dropItem() use to change one item without retyping the meal.
 */
export function parseMeal(text, { custom = [] } = {}) {
  const idx = buildIndex(custom);
  const { tokens, spans } = splitGlued(lex(text));
  const items = [];
  let pend = { qty: null, unit: null, size: 1, kcal: null, s: null, article: false };
  let eachAmt = null; // "2-3 pieces each": the amount (and where it was typed) for every cut vegetable around it
  let words = []; // consecutive words we couldn't place
  let negate = false; // "no ghee": drop the next thing
  let pendingSugar = null; // "no sugar" said before the chai

  const resetPending = () => { pend = { qty: null, unit: null, size: 1, kcal: null, s: null, article: false }; };
  const mark = (k) => { pend.s ??= k; }; // first token of the amount being read
  const at = (a, b) => (spans ? [spans[a][0], spans[b][1]] : null);
  const extend = (item, k) => { if (item.span && spans) item.span[1] = spans[k][1]; };

  // "2-3 pieces each": give the amount to the cut vegetables before it that had none (walking back from `from`)
  function spreadEach(qty, unit, from, span) {
    eachAmt = { qty, unit, span };
    for (let k = from; k >= 0; k--) {
      const it = items[k];
      if (it.food?.kind === 'vegmix') continue; // "roasted veggies: pumpkin, carrot ..." the heading is not another portion
      if (!it.food?.cutG || it.typed) break;
      it.qty = qty;
      it.unit = unit;
      cutIfPieces(it, { bare: true });
      it.typed = true;
      it.eachSpan = span;
      it.kcal = price(it);
    }
  }

  // is there a food later in this fragment ("2-3 pieces each of pumpkin, carrot")?
  function foodAhead(k) {
    for (let m = k; m < tokens.length && tokens[m] !== ','; m++) if (matchAlias(tokens, m, idx)) return true;
    return false;
  }

  function applySugar(keep) {
    for (let k = items.length - 1; k >= 0; k--) {
      const it = items[k];
      if (it.food?.sugar && it.sugarKeep === 1) { it.sugarKeep = keep; it.kcal = price(it); return; }
    }
    pendingSugar = keep;
  }

  function push(item) {
    if (negate) { negate = false; resetPending(); return null; }
    if (item.food?.sugar && pendingSugar != null) { item.sugarKeep = pendingSugar; pendingSugar = null; }
    item.kcal = price(item);
    items.push(item);
    resetPending();
    return item;
  }

  function flushWords() {
    if (!words.length) return;
    const name = words.join(' ');
    words = [];
    const explicit = pend.kcal;
    push({ name, food: null, qty: pend.qty ?? 1, unit: pend.unit, size: pend.size, sugarKeep: 1, explicit, unknown: explicit == null });
  }

  function endFragment() {
    flushWords();
    if (pend.kcal != null) push({ name: 'Other', food: null, qty: 1, unit: null, size: 1, sugarKeep: 1, explicit: pend.kcal, unknown: false });
    resetPending();
    negate = false;
  }

  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];
    if (t === ',') { endFragment(); i += 1; continue; }

    // "no sugar", "half sugar", "sugar free", "phiki": adjust the chai/coffee, don't add sugar
    const next = tokens[i + 1];
    if ((NO_WORDS.has(t) || LESS_WORDS.has(t)) && SUGAR_WORDS.has(next)) { applySugar(NO_WORDS.has(t) ? 0 : 0.5); i += 2; continue; }
    if (t === 'sugar' && next === 'free') { applySugar(0); i += 2; continue; }
    if (t === 'sugarfree' || t === 'phiki' || t === 'unsweetened') { applySugar(0); i += 1; continue; }
    // "less oil", "low ghee": a cooking note, not extra food
    if ((NO_WORDS.has(t) || LESS_WORDS.has(t)) && FAT_WORDS.has(next)) { i += 2; continue; }
    if (NO_WORDS.has(t)) { negate = true; i += 1; continue; }

    const hit = matchAlias(tokens, i, idx);
    if (hit) {
      const startI = i;
      if (hit.food.holder) words = []; // "jalapeno roll": the odd word is just the filling
      flushWords();
      i += hit.len;
      const typed = pend.qty != null || pend.unit != null || pend.size !== 1 || pend.kcal != null;
      const item = { name: hit.food.name, food: hit.food, qty: pend.qty ?? 1, unit: pend.unit, size: pend.size, sugarKeep: 1, explicit: pend.kcal, id: hit.food.id, custom: Boolean(hit.food.custom), end: i, typed, span: at(pend.s ?? startI, i - 1), nameSpan: at(startI, i - 1) };
      if (!typed && eachAmt && item.food.cutG) { // "2-3 pieces each of ..."
        item.qty = eachAmt.qty;
        item.unit = eachAmt.unit;
        item.typed = true;
        item.eachSpan = eachAmt.span;
        cutIfPieces(item, { bare: true });
      } else cutIfPieces(item, { bare: pend.qty != null && !pend.article && pend.size === 1 });
      // "beef roll", "cheese pizza": the first word is the filling, what you ate is the roll or the pizza
      const prev = items.at(-1);
      if (item.food.holder && prev && prev.end === startI && !prev.food?.holder && prev.explicit == null && !DRINK_UNITS.has(prev.food?.unit)) {
        if (pend.qty == null && !prev.unit && prev.qty !== 1) item.qty = prev.qty; // "2 beef roll" is two rolls
        if (prev.span && item.span) item.span = [prev.span[0], item.span[1]];
        if (prev.nameSpan && item.nameSpan) item.nameSpan = [prev.nameSpan[0], item.nameSpan[1]];
        item.typed ||= prev.typed;
        items.pop();
      }
      const implicit = pend.qty == null && pend.kcal == null;
      if (!item.unit && item.qty > 20 && item.food.grams) item.unit = 'g'; // "200 rice" means grams
      const placed = push(item);
      // quantity after the name: "roti 2", "chai 3 cups", "biryani 600 kcal"
      const num = placed ? readNumber(tokens, i, false) : null;
      if (placed && num) {
        let j = i + num.len;
        let unit = num.unit ?? null;
        if (!unit && UNIT_LOOKUP.has(tokens[j])) { unit = UNIT_LOOKUP.get(tokens[j]); j += 1; }
        const atEnd = j >= tokens.length || tokens[j] === ',';
        if (unit === 'kcal') { placed.explicit = num.value; placed.typed = true; placed.kcal = price(placed); extend(placed, j - 1); i = j; }
        else if (implicit && (unit || atEnd || tokens[j] === 'each')) {
          placed.qty = num.value;
          if (unit) placed.unit = unit;
          if (!placed.unit && placed.qty > 20 && placed.food.grams) placed.unit = 'g';
          cutIfPieces(placed, { bare: true });
          placed.typed = true;
          placed.kcal = price(placed);
          if (tokens[j] === 'each') { // the amount is for every item, not just this one
            const span = at(i, j);
            placed.eachSpan = span;
            spreadEach(placed.qty, placed.unit, items.length - 2, span);
            i = j + 1;
          }
          else { extend(placed, j - 1); i = j; }
        }
      }
      continue;
    }

    // "pumpkin carrot zucchini 2-3 pieces each" / "2-3 pieces each of pumpkin, carrot"
    if (t === 'each' && pend.qty != null && pend.kcal == null) {
      const { qty, unit: eachUnit } = pend;
      const span = at(pend.s ?? i, i);
      resetPending();
      spreadEach(qty, eachUnit, foodAhead(i + 1) ? -1 : items.length - 1, span);
      i += 1;
      continue;
    }

    const num = readNumber(tokens, i, pend.qty != null);
    if (num) {
      mark(i);
      pend.article = tokens[i] === 'a' || tokens[i] === 'an';
      let { value } = num;
      let len = num.len;
      let unit = num.unit ?? null;
      // a unit word that starts a longer food name ("2 cup cake") is part of the name, not a measure
      if (!unit && UNIT_LOOKUP.has(tokens[i + len]) && !(matchAlias(tokens, i + len, idx)?.len > 1)) { unit = UNIT_LOOKUP.get(tokens[i + len]); len += 1; }
      if (unit === 'kcal') pend.kcal = value;
      else {
        if (pend.qty != null && value < 1) value += pend.qty; // "1 and a half"
        pend.qty = value;
        if (unit) pend.unit = unit;
      }
      i += len;
      continue;
    }

    const unit = UNIT_LOOKUP.get(t);
    // "pumpkin cubes", "roasted chicken pieces": describing the item before it, not starting a new amount
    if ((unit === 'piece' || unit === 'cut') && pend.qty == null && items.at(-1)?.end === i) { i += 1; continue; }
    if (unit && !NEEDS_NUMBER.has(unit)) { mark(i); pend.unit = unit; if (pend.qty == null) pend.qty = 1; i += 1; continue; }
    if (unit) { i += 1; continue; } // a bare "g" or "ml" with no number
    if (Object.hasOwn(SIZE_WORDS, t)) { mark(i); pend.size = SIZE_WORDS[t]; i += 1; continue; }
    if (SEPARATORS.has(t)) { flushWords(); i += 1; continue; }
    if (FILLER.has(t)) { i += 1; continue; }

    const fixed = fuzzyKey(t, idx);
    if (fixed) { tokens[i] = fixed; continue; } // retry with the corrected spelling (it will match an alias now)
    words.push(t);
    i += 1;
  }
  endFragment();

  // "roasted veggies" as a heading over the vegetables you then listed is not a second portion
  if (items.some((it) => it.food?.kind === 'veg')) {
    for (let k = items.length - 1; k >= 0; k--) if (items[k].food?.kind === 'vegmix' && !items[k].typed) items.splice(k, 1);
  }

  const out = items.map(({ food, sugarKeep, size, end, typed, ...rest }) => ({ // eslint-disable-line no-unused-vars
    ...rest,
    rough: Boolean(food) && !typed,
    usual: food ? Math.round(food.kcal) : null,
    per: food ? `1 ${food.unit}${food.grams ? `, about ${food.grams} ${LIQUID_UNITS.has(food.unit) ? 'ml' : 'g'}` : ''}` : null,
  }));
  const known = out.filter((it) => it.kcal != null);
  return { items: out, kcal: known.reduce((a, it) => a + it.kcal, 0), unknown: out.filter((it) => it.unknown) };
}

/* ------------------------------------------------------------------ *
 * Changing one item without retyping the meal. The amounts are the same ones
 * the parser already understands ("a little", "half", "double", "30g"), so what
 * gets written back into the text is something you could have typed yourself.
 * ------------------------------------------------------------------ */

/** Rough amounts you can pick for any item (relative to one usual serving). */
// `say` lists phrasings to try in order: a phrase is used only if the text still reads back as the same foods
// (a few names contain words like "sweet", "butter" or "cup" that could be misread next to "a little" or "half").
export const AMOUNT_CHOICES = [
  { id: 'taste', label: 'Just a taste', factor: 0.12, say: ['a bite of', 'a taste of', 'tiny'] },
  { id: 'little', label: 'A little', factor: 0.35, say: ['a bit of', 'a little', 'thora'] },
  { id: 'half', label: 'Half', factor: 0.5, say: ['½', 'half', 'aadha', '0.5'] },
  { id: 'usual', label: 'The usual amount', factor: 1, say: ['', '1'] },
  { id: 'more', label: 'A bit more', factor: 1.5, say: ['extra', '1.5'] },
  { id: 'double', label: 'Double', factor: 2, say: ['twice', 'double', 'dugna'] },
];

const nameIn = (text, item) => text.slice(item.nameSpan[0], item.nameSpan[1]);
const canRewrite = (text, item) => Boolean(item?.span && item.nameSpan && item.span[1] <= text.length);

/** Swap this item's amount for a typed phrase ("a little", "half", "30g") and keep its name as you wrote it. */
export function rewriteItem(text, item, say) {
  if (!canRewrite(text, item)) return text;
  const name = nameIn(text, item);
  return text.slice(0, item.span[0]) + (say ? `${say} ${name}` : name) + text.slice(item.span[1]);
}

/** "pumpkin" -> "pumpkin 40 kcal" (typed calories always win). */
export function rewriteItemKcal(text, item, kcal) {
  if (!canRewrite(text, item)) return text;
  return `${text.slice(0, item.span[0])}${nameIn(text, item)} ${Math.round(kcal)} kcal${text.slice(item.span[1])}`;
}

/**
 * Of several candidate rewrites of `text`, the first that still reads back as the same meal (same foods in the
 * same order, nothing newly unknown). Returns null if none does, so a change is never written back wrongly.
 */
export function readsBack(text, candidates, { custom = [] } = {}) {
  const before = parseMeal(text, { custom }).items;
  return candidates.find((next) => {
    const after = parseMeal(next, { custom }).items;
    return after.length === before.length && after.every((it, k) => it.name === before[k].name && Boolean(it.unknown) === Boolean(before[k].unknown));
  }) ?? null;
}

/**
 * Take this item out of the text, tidying the commas around it. Pass the meal's other `items` so that, if this was
 * the last vegetable using a shared "2-3 pieces each", that phrase goes too instead of being left behind.
 */
export function dropItem(text, item, items = []) {
  if (!canRewrite(text, item)) return text;
  const cuts = [item.span];
  if (item.eachSpan && !items.some((o) => o !== item && o.eachSpan?.[0] === item.eachSpan[0])) cuts.push(item.eachSpan);
  cuts.sort((a, b) => b[0] - a[0]);
  return cuts.reduce((t, [a, b]) => t.slice(0, a) + t.slice(b), text)
    .replace(/\s*,(\s*,)+/g, ',')
    .replace(/^[\s,]+|[\s,]+$/g, '')
    .replace(/\s+,/g, ',')
    .replace(/\s{2,}/g, ' ');
}

/** Estimate a whole day's food: { meals, kcal, unknown, logged }. */
export function estimateFood(food = {}, custom = []) {
  const meals = {};
  const unknown = [];
  let kcal = 0;
  let logged = 0;
  for (const k of MEAL_KEYS) {
    const text = food?.[k];
    if (typeof text !== 'string' || !text.trim()) continue;
    logged += 1;
    const r = parseMeal(text, { custom });
    meals[k] = r;
    kcal += r.kcal;
    for (const u of r.unknown) unknown.push({ meal: k, ...u });
  }
  return { meals, kcal: Math.round(kcal), unknown, logged };
}

/** Add (or replace) a food you taught the app. Returns the cleaned list. */
export function addCustomFood(list, name, kcal) {
  return cleanCustomFoods([...(list ?? []).filter((c) => c.name !== String(name).toLowerCase().replace(/\s+/g, ' ').trim()), { name, kcal }]);
}

export const removeCustomFood = (list, name) => (list ?? []).filter((c) => c.name !== name);
