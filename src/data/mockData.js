const avatar = (seed, size = 96) =>
  `https://i.pravatar.cc/${size}?u=${seed}`

/* =========================================================
   CURRENT USER
========================================================= */

export const currentUser = {
  id: 'u0',
  name: 'Ayush Verma',
  avatar: avatar('ayush-verma'),
  verified: true,
  city: 'Pune',
  tagline: 'Building a fuller life in Pune, one good plan at a time.',
  bio: 'Pune · building a life worth showing up for.',
  tags: ['Social', 'Curious', 'Outdoors'],
  score: 842,
  reliability: 96,
  attended: 24,
  connections: 63,
}

/* =========================================================
   PEOPLE
========================================================= */

export const people = [
  {
    id: 'p1',
    name: 'Meera Shah',
    avatar: avatar('meera-shah'),
    verified: true,
    reliability: 99,
    bio: 'Product designer who is usually looking for a new table, trail or gig.',
    tags: ['Foodie', 'Curious', 'Social'],
  },

  {
    id: 'p2',
    name: 'Rohan Mehta',
    avatar: avatar('rohan-mehta'),
    verified: true,
    reliability: 98,
    bio: 'Pickleball captain, coffee enthusiast and proud Pune local.',
    tags: ['Sports', 'Chill', 'Social'],
  },

  {
    id: 'p3',
    name: 'Ananya Iyer',
    avatar: avatar('ananya-iyer'),
    verified: true,
    reliability: 96,
    bio: 'Design researcher, amateur drummer, serious about finding good rooftop gigs.',
    tags: ['Music', 'Creative', 'Foodie'],
  },

  {
    id: 'p4',
    name: 'Kabir Malhotra',
    avatar: avatar('kabir-malhotra'),
    verified: true,
    reliability: 94,
    bio: 'Weekend runner, weekday builder. Always up for a longer route.',
    tags: ['Outdoors', 'Energetic', 'Social'],
  },

  {
    id: 'p5',
    name: 'Tara Kulkarni',
    avatar: avatar('tara-kulkarni'),
    verified: true,
    reliability: 97,
    bio: 'Yoga teacher and sunrise-chaser. Will talk your ear off about tea.',
    tags: ['Chill', 'Outdoors', 'Wellness'],
  },

  {
    id: 'p6',
    name: 'Arjun Rao',
    avatar: avatar('arjun-rao'),
    verified: true,
    reliability: 92,
    bio: 'Casual hooper, serious about post-game breakfast.',
    tags: ['Sports', 'Energetic'],
  },

  /* =======================================================
     DEMO JOIN REQUEST APPLICANT
  ======================================================= */

  {
    id: 'p7',
    name: 'Nisha Kapoor',
    avatar: avatar('nisha-kapoor'),
    verified: true,
    reliability: 94,
    city: 'Pune',
    bio: 'Always looking for good people, easy plans and new places around Pune.',
    tags: ['Social', 'Outdoors', 'Curious'],
  },
]

/* =========================================================
   QUICK LOOKUP
========================================================= */

const byId = Object.fromEntries(
  people.map((person) => [person.id, person]),
)

/* =========================================================
   ACTIVITIES
========================================================= */

export const activities = [
  /* -------------------------------------------------------
     PUBLIC ACTIVITIES
  ------------------------------------------------------- */

  {
    id: 'pune-pickleball',
    title: 'Sunset Pickleball Social',
    category: 'Sports',
    vibe: ['Energetic', 'Social'],
    tags: [
      'Beginner friendly',
      'Small group',
      'Social vibe',
    ],

    image:
      'https://images.pexels.com/photos/29439364/pexels-photo-29439364.jpeg?auto=compress&cs=tinysrgb&w=1200',

    host: byId.p2,

    when: 'Today · 6:30 PM',
    date: 'Today',
    time: '6:30 PM',
    location: 'Deccan',
    distance: '1.4 km',

    price: 180,
    priceLabel: '₹180',

    badge: 'STARTING SOON',
    capacity: 8,

    going: [
      byId.p1,
      byId.p3,
      byId.p4,
      byId.p6,
    ],

    vibeMatches: 2,
    venue: 'Deccan Gymkhana Courts',

    description:
      'Casual, friendly pickleball for all levels. We rotate partners every few games so everyone gets to play with everyone. Paddles available for first-timers.',
  },

  {
    id: 'zen-boardgames',
    title: 'Coffee & Board Games at Zen',
    category: 'Games',
    vibe: ['Chill'],
    tags: ['Chill vibe'],

    image:
      'https://images.pexels.com/photos/4920902/pexels-photo-4920902.jpeg?auto=compress&cs=tinysrgb&w=1200',

    host: byId.p1,

    when: 'Today · 7:00 PM',
    date: 'Today',
    time: '7:00 PM',
    location: 'Koregaon Park',
    distance: '3.1 km',

    price: 0,
    priceLabel: 'Free',

    badge: 'TONIGHT',
    capacity: 8,

    going: [
      byId.p2,
      byId.p3,
      byId.p4,
      byId.p5,
      byId.p6,
      currentUser,
    ],

    vibeMatches: 3,
    venue: 'Zen Cafe, Koregaon Park',

    description:
      'No ticket, just show up. We keep a shelf of board games at Zen every week — Catan, Codenames, Uno, the works. Order your own coffee, everything else is free.',
  },

  {
    id: 'antisocial-acoustic',
    title: 'Indie Acoustic Rooftop Circle',
    category: 'Music',
    vibe: ['Creative'],
    tags: [
      'Live music',
      'Rooftop',
      'Creative vibe',
    ],

    image:
      'https://images.pexels.com/photos/7502173/pexels-photo-7502173.jpeg?auto=compress&cs=tinysrgb&w=1200',

    host: byId.p3,

    when: 'Today · 8:00 PM',
    date: 'Today',
    time: '8:00 PM',
    location: 'Baner',
    distance: '5.8 km',

    price: 250,
    priceLabel: '₹250',

    badge: 'TONIGHT',
    capacity: 12,

    going: [
      byId.p1,
      byId.p5,
      byId.p6,
    ],

    vibeMatches: 0,
    venue: 'antiSOCIAL, Baner',

    description:
      'Bring your own instrument or just come to listen. Open-mic style rooftop circle, three sets, chill crowd, no cover past 9pm.',
  },

  {
    id: 'viman-food-walk',
    title: 'Small Plates, Good Company',
    category: 'Food',
    vibe: ['Foodie'],
    tags: [
      'Dinner',
      'Vegetarian friendly',
      'Foodie vibe',
    ],

    image:
      'https://images.pexels.com/photos/15029824/pexels-photo-15029824.jpeg?auto=compress&cs=tinysrgb&w=1200',

    host: byId.p1,

    when: 'Friday · 8:30 PM',
    date: 'Friday',
    time: '8:30 PM',
    location: 'Koregaon Park',
    distance: '3.4 km',

    price: 650,
    priceLabel: '₹650',

    badge: 'THIS WEEKEND',
    capacity: 8,

    going: [
      byId.p3,
      byId.p4,
    ],

    vibeMatches: 1,
    venue: 'Fava, Koregaon Park',

    description:
      'A rotating tasting menu of small plates from a different Pune kitchen every week. Great for meeting people who take food seriously without being precious about it.',
  },

  {
    id: 'viman-yoga',
    title: 'Sunrise Yoga at the Park',
    category: 'Fitness',
    vibe: ['Chill', 'Outdoors'],
    tags: [
      'All levels',
      'Outdoors',
      'Chill vibe',
    ],

    image:
      'https://images.unsplash.com/photo-1758274535230-3641d0632878?auto=format&fit=crop&w=1200&q=80',

    host: byId.p5,

    when: 'Tomorrow · 6:15 AM',
    date: 'Tomorrow',
    time: '6:15 AM',
    location: 'Viman Nagar',
    distance: '6.2 km',

    price: 80,
    priceLabel: '₹80',

    badge: 'TOMORROW',
    capacity: 15,

    going: [
      byId.p2,
      byId.p4,
      byId.p6,
      byId.p1,
    ],

    vibeMatches: 4,
    venue: 'Viman Nagar Central Park',

    description:
      'Mat-to-mat sunrise flow for all levels, followed by chai at the gate. Bring your own mat or rent one for ₹20.',
  },

  {
    id: 'fc-5k-chai',
    title: 'FC Road 5K & Chai',
    category: 'Sports',
    vibe: ['Energetic', 'Social'],
    tags: [
      'Free to join',
      'Beginner friendly',
      'Energetic vibe',
    ],

    image:
      'https://images.unsplash.com/photo-1683194613814-6929a919c1fb?auto=format&fit=crop&w=1200&q=80',

    host: byId.p4,

    when: 'Tomorrow · 6:30 AM',
    date: 'Tomorrow',
    time: '6:30 AM',
    location: 'FC Road',
    distance: '2.8 km',

    price: 0,
    priceLabel: 'Free',

    badge: 'TOMORROW',
    capacity: 20,

    going: [
      byId.p1,
      byId.p2,
      byId.p3,
      byId.p6,
    ],

    vibeMatches: 3,
    venue: 'FC Road Junction',

    description:
      'Easy-paced 5K, no one gets left behind. We regroup for chai and vada pav after — the real reason people show up on time.',
  },

  {
    id: 'kalyani-jam',
    title: 'Drums, Jams & New Friends',
    category: 'Music',
    vibe: ['Creative'],
    tags: [
      'Instruments provided',
      'Creative',
      'Creative vibe',
    ],

    image:
      'https://images.unsplash.com/photo-1565103001996-3fa52eb269d1?auto=format&fit=crop&w=1200&q=80',

    host: byId.p3,

    when: 'Friday · 7:30 PM',
    date: 'Friday',
    time: '7:30 PM',
    location: 'Kalyani Nagar',
    distance: '4.6 km',

    price: 0,
    priceLabel: 'Free',

    badge: 'FRIDAY',
    capacity: 10,

    going: [
      byId.p1,
      byId.p2,
      byId.p5,
      byId.p6,
      byId.p4,
    ],

    vibeMatches: 2,
    venue: 'The Jam Room, Kalyani Nagar',

    description:
      'No experience needed. We have a house kit, a couple of guitars and a keyboard — just bring energy. Great for meeting other creative folks in the city.',
  },

  {
    id: 'baner-3v3',
    title: 'Casual 3v3 Basketball',
    category: 'Sports',
    vibe: ['Energetic'],
    tags: [
      'Mixed teams',
      'Breakfast after',
      'Energetic vibe',
    ],

    image:
      'https://images.unsplash.com/photo-1525918779320-0ca02e9a8b6a?auto=format&fit=crop&w=1200&q=80',

    host: byId.p6,

    when: 'Saturday · 7:00 AM',
    date: 'Saturday',
    time: '7:00 AM',
    location: 'Baner',
    distance: '7.1 km',

    price: 120,
    priceLabel: '₹120',

    badge: 'THIS WEEKEND',
    capacity: 12,

    going: [
      byId.p1,
      byId.p2,
      byId.p4,
    ],

    vibeMatches: 1,
    venue: 'Baner Sports Complex',

    description:
      'Mixed-skill 3v3 half-court games, teams shuffled each round so it stays fair and fun. Breakfast at the stall outside right after.',
  },

  /* =======================================================
     AYUSH HOSTED PLAN
     THIS IS THE DEMO PLAN FOR JOIN REQUESTS
  ======================================================= */

  {
    id: 'sunday-cycling',

    title: 'Sunday Easy Cycling Loop',

    category: 'Outdoors',

    vibe: [
      'Chill',
      'Outdoors',
    ],

    tags: [
      'All levels',
      'Bring your own cycle',
    ],

    image:
      'https://images.unsplash.com/photo-1735216228027-fe31c23474ce?auto=format&fit=crop&w=1200&q=80',

    /*
     * IMPORTANT:
     * Ayush is the host.
     * This makes Plans Hosted = 1
     * and enables Manage Join Requests.
     */
    host: currentUser,

    when: 'Sunday · 6:00 AM',
    date: 'Sunday',
    time: '6:00 AM',

    location: 'Vetal Tekdi',
    distance: '5.0 km',

    price: 0,
    priceLabel: 'Free',

    badge: 'SUNDAY',

    capacity: 15,

    going: [
      byId.p1,
      byId.p3,
      byId.p5,
    ],

    vibeMatches: 2,

    venue: 'Vetal Tekdi Gate',

    description:
      'Easy 20km loop, regroup at every junction so no one gets dropped. Ends with filter coffee at the usual spot.',
  },

  /* =======================================================
     PRIVATE ACTIVITIES
  ======================================================= */

  {
    id: 'koregaon-private-dinner',

    title: 'Rooftop Dinner & New Faces',

    category: 'Food',

    visibility: 'private',

    vibe: [
      'Foodie',
      'Social',
    ],

    tags: [
      'Small group',
      'Dinner',
      'Private group',
    ],

    image:
      'https://images.unsplash.com/photo-1515003197210-e0cd71810b5f?auto=format&fit=crop&w=1200&q=80',

    host: byId.p1,

    when: 'Saturday · 8:00 PM',
    date: 'Saturday',
    time: '8:00 PM',

    location: 'Koregaon Park',
    distance: '3.4 km',

    price: 700,
    priceLabel: '₹700',

    badge: 'PRIVATE',

    capacity: 6,

    going: [
      byId.p3,
      byId.p5,
    ],

    vibeMatches: 3,

    venue: 'Rooftop, Koregaon Park',

    description:
      'A small dinner table for people who enjoy good food and easy conversation. The exact table details are shared after your request is approved.',
  },

  {
    id: 'viman-private-brunch',

    title: 'Sunday Brunch Table',

    category: 'Food',

    visibility: 'private',

    vibe: [
      'Foodie',
      'Chill',
    ],

    tags: [
      'Brunch',
      'Small group',
      'Easygoing',
    ],

    image:
      'https://images.unsplash.com/photo-1533777857889-4be7c70b33f7?auto=format&fit=crop&w=1200&q=80',

    host: byId.p3,

    when: 'Sunday · 11:00 AM',
    date: 'Sunday',
    time: '11:00 AM',

    location: 'Viman Nagar',
    distance: '6.0 km',

    price: 500,
    priceLabel: '₹500',

    badge: 'PRIVATE',

    capacity: 7,

    going: [
      byId.p1,
      byId.p6,
    ],

    vibeMatches: 2,

    venue: 'Viman Nagar',

    description:
      'A relaxed Sunday brunch with a small group. Join request is reviewed by the host before the exact venue details are shared.',
  },

  {
    id: 'baner-photo-walk',

    title: 'Golden Hour Photo Walk',

    category: 'Outdoors',

    visibility: 'private',

    vibe: [
      'Creative',
      'Outdoors',
    ],

    tags: [
      'Photography',
      'Golden hour',
      'Small group',
    ],

    image:
      'https://images.unsplash.com/photo-1452587925148-ce544e77e70d?auto=format&fit=crop&w=1200&q=80',

    host: byId.p4,

    when: 'Saturday · 5:30 PM',
    date: 'Saturday',
    time: '5:30 PM',

    location: 'Baner',
    distance: '6.5 km',

    price: 0,
    priceLabel: 'Free',

    badge: 'PRIVATE',

    capacity: 6,

    going: [
      byId.p3,
      byId.p5,
    ],

    vibeMatches: 3,

    venue: 'Baner',

    description:
      'A slow golden-hour walk for people who enjoy photography, streets and good conversations. Detailed meeting point is shared after approval.',
  },

  {
    id: 'fc-private-chai',

    title: 'Late Evening Chai Circle',

    category: 'Social',

    visibility: 'private',

    vibe: [
      'Chill',
      'Social',
    ],

    tags: [
      'Chai',
      'Conversation',
      'Small group',
    ],

    image:
      'https://images.unsplash.com/photo-1576092768241-dec231879fc3?auto=format&fit=crop&w=1200&q=80',

    host: byId.p5,

    when: 'Friday · 8:30 PM',
    date: 'Friday',
    time: '8:30 PM',

    location: 'FC Road',
    distance: '2.9 km',

    price: 150,
    priceLabel: '₹150',

    badge: 'PRIVATE',

    capacity: 6,

    going: [
      byId.p2,
      byId.p6,
    ],

    vibeMatches: 2,

    venue: 'FC Road',

    description:
      'A small evening chai circle for relaxed conversations and meeting new people. Exact meeting details are shared after approval.',
  },

  {
    id: 'weekend-private-run',

    title: 'Weekend Run & Breakfast',

    category: 'Sports',

    visibility: 'private',

    vibe: [
      'Energetic',
      'Social',
    ],

    tags: [
      'Running',
      'Breakfast',
      'Small group',
    ],

    image:
      'https://images.unsplash.com/photo-1552674605-db6ffd4facb5?auto=format&fit=crop&w=1200&q=80',

    host: byId.p6,

    when: 'Sunday · 7:00 AM',
    date: 'Sunday',
    time: '7:00 AM',

    location: 'Kalyani Nagar',
    distance: '4.8 km',

    price: 250,
    priceLabel: '₹250',

    badge: 'PRIVATE',

    capacity: 8,

    going: [
      byId.p2,
      byId.p4,
    ],

    vibeMatches: 3,

    venue: 'Kalyani Nagar',

    description:
      'A casual weekend run followed by breakfast together. The group stays small and the final meeting point is shared after approval.',
  },
]

/* =========================================================
   ACTIVITY LOOKUP
========================================================= */

export const activityById = Object.fromEntries(
  activities.map((activity) => [
    activity.id,
    activity,
  ]),
)

/* =========================================================
   MOODS
========================================================= */

export const moods = [
  {
    id: 'free-tonight',
    label: "I'm free tonight",
  },

  {
    id: 'meet-new-people',
    label: 'Meet new people',
  },

  {
    id: 'outdoors',
    label: 'Something outdoors',
  },

  {
    id: 'good-food',
    label: 'Good food nearby',
  },
]

/* =========================================================
   CATEGORIES
========================================================= */

export const categories = [
  'Everything',
  'Sports',
  'Social',
  'Fitness',
  'Music',
  'Food',
  'Games',
  'Outdoors',
]

/* =========================================================
   VIBES
========================================================= */

export const vibes = [
  'All vibes',
  'Chill',
  'Social',
  'Energetic',
  'Creative',
  'Adventurous',
  'Foodie',
]

/* =========================================================
   CHATS
========================================================= */

export const chats = [
  {
    id: 'c1',

    activityId: 'pune-pickleball',

    title: 'Sunset Pickleball Social',

    image:
      'https://images.pexels.com/photos/29439364/pexels-photo-29439364.jpeg?auto=compress&cs=tinysrgb&w=1200',

    person: byId.p2,

    lastMessage:
      "Rohan: I'll bring an extra paddle.",

    time: '12m',

    unread: true,

    messages: [
      {
        from: 'p2',
        text: 'Hey! Excited for tonight 🎾',
        time: '5:40 PM',
      },

      {
        from: 'me',
        text: 'Same, first time playing pickleball actually',
        time: '5:42 PM',
      },

      {
        from: 'p2',
        text: "No worries, we'll go easy on you",
        time: '5:43 PM',
      },

      {
        from: 'p2',
        text: "I'll bring an extra paddle.",
        time: '5:44 PM',
      },
    ],
  },

  {
    id: 'c2',

    activityId: 'zen-boardgames',

    title: 'Coffee & Board Games at Zen',

    image:
      'https://images.pexels.com/photos/4920902/pexels-photo-4920902.jpeg?auto=compress&cs=tinysrgb&w=1200',

    person: byId.p1,

    lastMessage:
      'Meera: Table is booked for 7.',

    time: '1h',

    unread: false,

    messages: [
      {
        from: 'p1',
        text: 'Table is booked for 7.',
        time: '4:30 PM',
      },

      {
        from: 'me',
        text: 'Perfect, see you all there',
        time: '4:35 PM',
      },
    ],
  },

  {
    id: 'c3',

    activityId: 'sunday-cycling',

    title: 'Sunday Easy Cycling Loop',

    image:
      'https://images.unsplash.com/photo-1735216228027-fe31c23474ce?auto=format&fit=crop&w=1200&q=80',

    /*
     * Chat participant can remain Kabir.
     * This is separate from the activity host.
     */
    person: byId.p4,

    lastMessage:
      'Kabir: Meet at Vetal Tekdi gate.',

    time: 'Yesterday',

    unread: false,

    messages: [
      {
        from: 'p4',
        text: 'Meet at Vetal Tekdi gate.',
        time: 'Yesterday',
      },

      {
        from: 'me',
        text: 'Got it, see you at 6',
        time: 'Yesterday',
      },
    ],
  },
]

/* =========================================================
   UPDATES
========================================================= */

export const updates = [
  {
    id: 'up1',
    icon: 'check',
    text:
      "You're going to Sunset Pickleball Social. 4 people are already in.",
    to: '/activities/pune-pickleball',
  },

  {
    id: 'up2',
    icon: 'chat',
    text:
      'Meera shared a plan that matches your foodie vibe.',
    to: '/explore?category=Food',
  },
]

/* =========================================================
   MILESTONES
========================================================= */

export const milestones = [
  {
    id: 'm1',
    icon: 'check',
    title: 'First step',
    subtitle: 'Attended your first plan',
  },

  {
    id: 'm2',
    icon: 'users',
    title: 'Connector',
    subtitle: 'Built 50+ real connections',
  },

  {
    id: 'm3',
    icon: 'star',
    title: 'Good energy',
    subtitle: '96% reliability streak',
  },
]

/* =========================================================
   TRUST / PASSPORT SIGNALS
========================================================= */

export const passportSignals = [
  {
    id: 's1',
    icon: 'shield',
    title: 'Identity verified',
    subtitle:
      'People see the outcome, never your documents.',
  },

  {
    id: 's2',
    icon: 'star',
    title: '96% reliable',
    subtitle:
      'Based on showing up and hosting well.',
  },

  {
    id: 's3',
    icon: 'bolt',
    title: 'Trusted member',
    subtitle:
      '842 points of real-world reputation.',
  },
]