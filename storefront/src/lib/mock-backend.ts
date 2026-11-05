import type {
  AdminFlag,
  AdminUser,
  AppNotification,
  DeadLetter,
  DeadLetterService,
  Delivery,
  Diet,
  Inbox,
  Me,
  MenuItem,
  MenuItemPayload,
  Order,
  Partner,
  Payment,
  RefundResponse,
  Restaurant,
  StaffOrder,
  TeamInvite,
  TeamMember,
  TokenResponse,
  TrackedOrder,
} from "./api";
import { findDietViolations } from "../features/catalog/diet";

export interface SeedRestaurant extends Restaurant {
  id: string;
  name: string;
  fssaiNumber: string;
  cuisine: string;
  kitchenCertificationLevel: string;
  lat: number;
  lng: number;
  deliveryRadiusMeters: number;
  open: boolean;
  ownerUserId?: string;
  menu: MenuItem[];
}

export interface StoredUser {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  emailVerified: boolean;
  password?: string;
  roles: string[];
  mainAdmin?: boolean;
  status?: string;
  createdAt?: string;
  consents?: Record<string, { version: string; granted: boolean; updatedAt: string }>;
  preferences?: Record<string, unknown>;
}

export interface StoredOrder extends Order {
  id: string;
  userId: string;
  orderNumber: string;
  rawOrderNumber: string;
  restaurantId: string;
  restaurantName: string;
  status: string;
  subtotalPaise: number;
  taxPaise: number;
  deliveryFeePaise: number;
  totalPaise: number;
  items: {
    itemId: string;
    name: string;
    quantity: number;
    unitPricePaise: number;
    pricePaise: number;
    linePaise: number;
  }[];
  deliveryOtp: string;
  deliveryAddress?: string | null;
  cookingInstructions?: string | null;
  cancellationReason?: string | null;
  createdAt: string;
  updatedAt: string;
  timeline: { status: string; at: string; reason?: string | null }[];
  paid?: boolean;
}

export class HttpProblem extends Error {
  readonly status: number;
  readonly title: string;
  readonly detail?: string;

  constructor(status: number, title: string, detail?: string) {
    super(detail ? `${title}: ${detail}` : title);
    this.status = status;
    this.title = title;
    this.detail = detail;
  }
}

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function generateOrderNumber(): { raw: string; display: string } {
  let raw = "";
  for (let i = 0; i < 10; i++) {
    raw += CROCKFORD[Math.floor(Math.random() * CROCKFORD.length)];
  }
  return {
    raw,
    display: `FA-${raw.slice(0, 5)}-${raw.slice(5)}`,
  };
}

export function normalizeOrderNumber(input: string): string | null {
  if (!input || input.length > 32) return null;
  let s = input.toUpperCase().replace(/[\s-]/g, "");
  if (s.length === 12 && s.startsWith("FA")) {
    s = s.slice(2);
  }
  if (s.length !== 10) return null;
  s = s.replace(/O/g, "0").replace(/[IL]/g, "1");
  for (let i = 0; i < s.length; i++) {
    if (!CROCKFORD.includes(s[i])) return null;
  }
  return s;
}

export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

const INITIAL_RESTAURANTS: SeedRestaurant[] = [
  {
    id: "rest-saffron-1",
    name: "Saffron Pure Veg Bhavan",
    fssaiNumber: "11224001000101",
    cuisine: "South Indian",
    kitchenCertificationLevel: "TIER_1_EXCLUSIVE_VEG",
    lat: 12.975,
    lng: 77.605,
    deliveryRadiusMeters: 6000,
    open: true,
    ownerUserId: "00000000-0000-0000-0000-000000000001",
    menu: [
      {
        id: "item-saffron-1",
        name: "Paneer Butter Masala",
        description: "Creamy tomato gravy with paneer",
        pricePaise: 24900,
        isPureVeg: true,
        isVegan: false,
        isJain: false,
        available: true,
        ingredients: ["paneer", "butter", "tomato", "cream", "onion"],
        containsAllergens: ["milk"],
      },
      {
        id: "item-saffron-2",
        name: "Masala Dosa",
        description: "Crisp rice crepe with potato masala",
        pricePaise: 14900,
        isPureVeg: true,
        isVegan: true,
        isJain: false,
        available: true,
        ingredients: ["rice", "urad dal", "potato", "onion", "mustard seeds", "oil"],
        containsAllergens: [],
      },
      {
        id: "item-saffron-3",
        name: "Idli Sambar",
        description: "Steamed idlis with lentil stew",
        pricePaise: 11900,
        isPureVeg: true,
        isVegan: true,
        isJain: false,
        available: true,
        ingredients: ["rice", "urad dal", "toor dal", "tomato", "onion"],
        containsAllergens: [],
      },
      {
        id: "item-saffron-4",
        name: "Dal Tadka",
        description: "Yellow lentils tempered with ghee and garlic",
        pricePaise: 17900,
        isPureVeg: true,
        isVegan: false,
        isJain: false,
        available: true,
        ingredients: ["toor dal", "ghee", "garlic", "cumin"],
        containsAllergens: ["milk"],
      },
      {
        id: "item-saffron-5",
        name: "Vegetable Biryani",
        description: "Basmati rice layered with vegetables and curd",
        pricePaise: 21900,
        isPureVeg: true,
        isVegan: false,
        isJain: false,
        available: true,
        ingredients: ["basmati rice", "carrot", "beans", "yogurt", "spices"],
        containsAllergens: ["milk"],
      },
      {
        id: "item-saffron-6",
        name: "Gulab Jamun",
        description: "Milk-solid dumplings in sugar syrup",
        pricePaise: 9900,
        isPureVeg: true,
        isVegan: false,
        isJain: false,
        available: true,
        ingredients: ["khoya", "sugar", "ghee", "cardamom"],
        containsAllergens: ["milk", "gluten"],
      },
    ],
  },
  {
    id: "rest-green-2",
    name: "Green Leaf Vegan Kitchen",
    fssaiNumber: "11224001000102",
    cuisine: "Vegan",
    kitchenCertificationLevel: "TIER_1_EXCLUSIVE_VEG",
    lat: 12.96,
    lng: 77.59,
    deliveryRadiusMeters: 5000,
    open: true,
    ownerUserId: "00000000-0000-0000-0000-000000000001",
    menu: [
      {
        id: "item-green-1",
        name: "Tofu Tikka Bowl",
        description: "Grilled tofu with peppers in coconut cream",
        pricePaise: 27900,
        isPureVeg: true,
        isVegan: true,
        isJain: false,
        available: true,
        ingredients: ["tofu", "bell pepper", "coconut cream", "spices"],
        containsAllergens: ["soy"],
      },
      {
        id: "item-green-2",
        name: "Chana Masala",
        description: "Chickpea curry",
        pricePaise: 18900,
        isPureVeg: true,
        isVegan: true,
        isJain: false,
        available: true,
        ingredients: ["chickpeas", "tomato", "onion", "spices"],
        containsAllergens: [],
      },
      {
        id: "item-green-3",
        name: "Jackfruit Biryani",
        description: "Slow-cooked jackfruit and basmati rice",
        pricePaise: 25900,
        isPureVeg: true,
        isVegan: true,
        isJain: false,
        available: true,
        ingredients: ["jackfruit", "basmati rice", "coconut oil", "spices"],
        containsAllergens: [],
      },
      {
        id: "item-green-4",
        name: "Coconut Milk Kheer",
        description: "Rice pudding in coconut milk and jaggery",
        pricePaise: 12900,
        isPureVeg: true,
        isVegan: true,
        isJain: false,
        available: true,
        ingredients: ["rice", "coconut milk", "jaggery", "cardamom"],
        containsAllergens: [],
      },
      {
        id: "item-green-5",
        name: "Millet Upma",
        description: "Foxtail millet upma without onion",
        pricePaise: 12900,
        isPureVeg: true,
        isVegan: true,
        isJain: true,
        available: true,
        ingredients: ["foxtail millet", "peas", "curry leaves", "mustard seeds"],
        containsAllergens: [],
      },
      {
        id: "item-green-6",
        name: "Peanut Butter Banana Smoothie",
        description: "Oat milk smoothie",
        pricePaise: 16900,
        isPureVeg: true,
        isVegan: true,
        isJain: false,
        available: true,
        ingredients: ["peanut butter", "banana", "oat milk"],
        containsAllergens: ["peanuts"],
      },
    ],
  },
  {
    id: "rest-jain-3",
    name: "Jain Rasoi",
    fssaiNumber: "11224001000103",
    cuisine: "Gujarati",
    kitchenCertificationLevel: "TIER_1_EXCLUSIVE_VEG",
    lat: 12.985,
    lng: 77.58,
    deliveryRadiusMeters: 5000,
    open: true,
    ownerUserId: "00000000-0000-0000-0000-000000000001",
    menu: [
      {
        id: "item-jain-1",
        name: "Jain Pav Bhaji",
        description: "Mashed vegetables without onion, garlic or potato",
        pricePaise: 15900,
        isPureVeg: true,
        isVegan: false,
        isJain: true,
        available: true,
        ingredients: ["tomato", "peas", "capsicum", "butter", "pav"],
        containsAllergens: ["milk", "gluten"],
      },
      {
        id: "item-jain-2",
        name: "Sabudana Khichdi",
        description: "Tapioca pearls with peanuts",
        pricePaise: 13900,
        isPureVeg: true,
        isVegan: true,
        isJain: true,
        available: true,
        ingredients: ["sabudana", "peanuts", "cumin", "green chilli", "oil"],
        containsAllergens: ["peanuts"],
      },
      {
        id: "item-jain-3",
        name: "Khaman Dhokla",
        description: "Steamed gram flour cake",
        pricePaise: 9900,
        isPureVeg: true,
        isVegan: true,
        isJain: true,
        available: true,
        ingredients: ["gram flour", "lemon juice", "fruit salt", "mustard seeds", "sugar"],
        containsAllergens: [],
      },
      {
        id: "item-jain-4",
        name: "Paneer Tikka (Jain)",
        description: "Tandoori paneer with peppers",
        pricePaise: 21900,
        isPureVeg: true,
        isVegan: false,
        isJain: true,
        available: true,
        ingredients: ["paneer", "bell pepper", "yogurt", "spices"],
        containsAllergens: ["milk"],
      },
      {
        id: "item-jain-5",
        name: "Kesar Shrikhand",
        description: "Saffron strained-curd dessert",
        pricePaise: 12900,
        isPureVeg: true,
        isVegan: false,
        isJain: true,
        available: true,
        ingredients: ["hung curd", "saffron", "sugar", "cardamom"],
        containsAllergens: ["milk"],
      },
      {
        id: "item-jain-6",
        name: "Jain Dal Dhokli",
        description: "Wheat dumplings in sweet-sour dal",
        pricePaise: 17900,
        isPureVeg: true,
        isVegan: true,
        isJain: true,
        available: true,
        ingredients: ["toor dal", "wheat flour", "jaggery", "peanuts", "kokum"],
        containsAllergens: ["gluten", "peanuts"],
      },
    ],
  },
  {
    id: "rest-spice-4",
    name: "Spice Route Kitchen",
    fssaiNumber: "11224001000104",
    cuisine: "North Indian",
    kitchenCertificationLevel: "TIER_2_SEGREGATED_KITCHEN",
    lat: 12.97,
    lng: 77.6,
    deliveryRadiusMeters: 4000,
    open: true,
    ownerUserId: "00000000-0000-0000-0000-000000000001",
    menu: [
      {
        id: "item-spice-1",
        name: "Chicken Biryani",
        description: "Dum biryani with bone-in chicken",
        pricePaise: 29900,
        isPureVeg: false,
        isVegan: false,
        isJain: false,
        available: true,
        ingredients: ["chicken", "basmati rice", "yogurt", "spices"],
        containsAllergens: ["milk"],
      },
      {
        id: "item-spice-2",
        name: "Butter Chicken",
        description: "Tandoori chicken in tomato-butter gravy",
        pricePaise: 32900,
        isPureVeg: false,
        isVegan: false,
        isJain: false,
        available: true,
        ingredients: ["chicken", "butter", "cream", "tomato"],
        containsAllergens: ["milk"],
      },
      {
        id: "item-spice-3",
        name: "Egg Curry",
        description: "Boiled eggs in onion-tomato masala",
        pricePaise: 21900,
        isPureVeg: false,
        isVegan: false,
        isJain: false,
        available: true,
        ingredients: ["egg", "onion", "tomato", "spices"],
        containsAllergens: ["egg"],
      },
      {
        id: "item-spice-4",
        name: "Fish Fry",
        description: "Masala-crusted pomfret",
        pricePaise: 31900,
        isPureVeg: false,
        isVegan: false,
        isJain: false,
        available: true,
        ingredients: ["fish", "rice flour", "spices"],
        containsAllergens: ["fish"],
      },
      {
        id: "item-spice-5",
        name: "Veg Thali",
        description: "Dal, paneer, rice and roti",
        pricePaise: 23900,
        isPureVeg: true,
        isVegan: false,
        isJain: false,
        available: true,
        ingredients: ["toor dal", "paneer", "rice", "wheat flour", "cumin"],
        containsAllergens: ["milk", "gluten"],
      },
      {
        id: "item-spice-6",
        name: "Mushroom Pepper Fry",
        description: "Stir-fried mushrooms with black pepper",
        pricePaise: 19900,
        isPureVeg: true,
        isVegan: true,
        isJain: false,
        available: true,
        ingredients: ["mushroom", "black pepper", "onion", "oil"],
        containsAllergens: [],
      },
    ],
  },
];

const INITIAL_FLAGS: AdminFlag[] = [
  {
    key: "otp_login",
    enabled: true,
    description: "Phone OTP sign-in and sign-up (enforced by identity-service)",
    updatedAt: "2026-01-01T00:00:00.000Z",
    updatedBy: null,
  },
  {
    key: "email_registration",
    enabled: true,
    description: "Creating new accounts with email and password (enforced by identity-service)",
    updatedAt: "2026-01-01T00:00:00.000Z",
    updatedBy: null,
  },
  {
    key: "guest_checkout",
    enabled: true,
    description: "Let visitors order with only a name and phone number (storefront)",
    updatedAt: "2026-01-01T00:00:00.000Z",
    updatedBy: null,
  },
  {
    key: "order_tracking",
    enabled: true,
    description: "Public order tracking by order number (storefront)",
    updatedAt: "2026-01-01T00:00:00.000Z",
    updatedBy: null,
  },
  {
    key: "live_order_updates",
    enabled: true,
    description: "Live order status stream; falls back to polling when off (storefront)",
    updatedAt: "2026-01-01T00:00:00.000Z",
    updatedBy: null,
  },
  {
    key: "delivery_module",
    enabled: true,
    description: "Delivery partner area and fleet dispatch",
    updatedAt: "2026-01-01T00:00:00.000Z",
    updatedBy: null,
  },
  {
    key: "admin_login_code",
    enabled: false,
    description: "Require a one-time email code after password on /admin/login",
    updatedAt: "2026-01-01T00:00:00.000Z",
    updatedBy: null,
  },
];

interface BackendState {
  restaurants: SeedRestaurant[];
  flags: Map<string, AdminFlag>;
  users: Map<string, StoredUser>;
  tokens: Map<string, string>; // token -> userId
  emailTokens: Map<string, string>; // token -> userId
  teamInvites: Map<string, TeamInvite>;
  orders: Map<string, StoredOrder>;
  payments: Map<string, Payment>;
  idempotentOrders: Map<string, StoredOrder>;
  idempotentPayments: Map<string, Payment>;
  deliveries: Map<string, Delivery>;
  partners: Map<string, Partner>;
  notifications: Map<string, AppNotification[]>; // userId -> notifications
  deadLetters: Record<DeadLetterService, DeadLetter[]>;
}

const globalForBackend = globalThis as unknown as { __foodAppBackend?: BackendState };

function createInitialState(): BackendState {
  const flags = new Map<string, AdminFlag>();
  for (const f of INITIAL_FLAGS) {
    flags.set(f.key, { ...f });
  }
  const users = new Map<string, StoredUser>();
  const mainAdmin: StoredUser = {
    id: "00000000-0000-0000-0000-000000000001",
    name: "Nagireddy Mudusu",
    phone: "+919811100001",
    email: "nagireddy.mudusu@gmail.com",
    emailVerified: true,
    roles: ["CUSTOMER", "ADMIN", "SUPER_ADMIN", "RESTAURANT", "PARTNER"],
    mainAdmin: true,
    status: "ACTIVE",
    createdAt: "2026-01-15T08:00:00.000Z",
  };
  users.set(mainAdmin.id, mainAdmin);

  const kitchenPartnerUser: StoredUser = {
    id: "00000000-0000-0000-0000-000000000002",
    name: "Aarav Sharma",
    phone: "+919811100002",
    email: "aarav.kitchen@veggoeats.in",
    emailVerified: true,
    roles: ["CUSTOMER", "RESTAURANT"],
    mainAdmin: false,
    status: "ACTIVE",
    createdAt: "2026-02-01T10:30:00.000Z",
  };
  users.set(kitchenPartnerUser.id, kitchenPartnerUser);

  const riderPartnerUser: StoredUser = {
    id: "00000000-0000-0000-0000-000000000003",
    name: "Priya Nair",
    phone: "+919811100003",
    email: "priya.rider@veggoeats.in",
    emailVerified: true,
    roles: ["CUSTOMER", "PARTNER"],
    mainAdmin: false,
    status: "ACTIVE",
    createdAt: "2026-02-10T12:15:00.000Z",
  };
  users.set(riderPartnerUser.id, riderPartnerUser);

  const customerUser: StoredUser = {
    id: "00000000-0000-0000-0000-000000000004",
    name: "Rohan Mehta",
    phone: "+919811100004",
    email: "rohan.mehta@example.com",
    emailVerified: true,
    roles: ["CUSTOMER"],
    mainAdmin: false,
    status: "ACTIVE",
    createdAt: "2026-02-18T14:45:00.000Z",
  };
  users.set(customerUser.id, customerUser);

  const now = Date.now();
  const t1 = new Date(now - 6 * 60_000).toISOString();
  const t2 = new Date(now - 14 * 60_000).toISOString();
  const t3 = new Date(now - 55 * 60_000).toISOString();

  const orders = new Map<string, StoredOrder>([
    [
      "ord_seed_1",
      {
        id: "ord_seed_1",
        userId: mainAdmin.id,
        orderNumber: "FA-7K2M9-P4X8Q",
        rawOrderNumber: "7K2M9P4X8Q",
        restaurantId: "rest-saffron-1",
        restaurantName: "Saffron Pure Veg Bhavan",
        status: "PAID",
        subtotalPaise: 39800,
        taxPaise: 1990,
        deliveryFeePaise: 3000,
        totalPaise: 44790,
        items: [
          {
            itemId: "item-saffron-1",
            name: "Paneer Butter Masala",
            quantity: 1,
            unitPricePaise: 24900,
            pricePaise: 24900,
            linePaise: 24900,
          },
          {
            itemId: "item-saffron-2",
            name: "Masala Dosa",
            quantity: 1,
            unitPricePaise: 14900,
            pricePaise: 14900,
            linePaise: 14900,
          },
        ],
        deliveryOtp: "4829",
        deliveryAddress: "Flat 302, Haldi Residency, MG Road, Bengaluru",
        cookingInstructions: "Less spicy · Extra coconut chutney on the side",
        createdAt: t1,
        updatedAt: t1,
        timeline: [
          { status: "CREATED", at: t1 },
          { status: "PAID", at: t1 },
        ],
        paid: true,
      },
    ],
    [
      "ord_seed_2",
      {
        id: "ord_seed_2",
        userId: mainAdmin.id,
        orderNumber: "FA-3R8W5-V2N6J",
        rawOrderNumber: "3R8W5V2N6J",
        restaurantId: "rest-green-2",
        restaurantName: "Green Leaf Vegan Kitchen",
        status: "PREPARING",
        subtotalPaise: 46800,
        taxPaise: 2340,
        deliveryFeePaise: 3000,
        totalPaise: 52140,
        items: [
          {
            itemId: "item-green-1",
            name: "Tofu Tikka Bowl",
            quantity: 1,
            unitPricePaise: 27900,
            pricePaise: 27900,
            linePaise: 27900,
          },
          {
            itemId: "item-green-2",
            name: "Chana Masala",
            quantity: 1,
            unitPricePaise: 18900,
            pricePaise: 18900,
            linePaise: 18900,
          },
        ],
        deliveryOtp: "6194",
        deliveryAddress: "12th Main, Indiranagar, Bengaluru",
        cookingInstructions: "Strictly dairy-free utensils please",
        createdAt: t2,
        updatedAt: t1,
        timeline: [
          { status: "CREATED", at: t2 },
          { status: "PAID", at: t2 },
          { status: "MERCHANT_ACCEPTED", at: t1 },
          { status: "PREPARING", at: t1 },
        ],
        paid: true,
      },
    ],
    [
      "ord_seed_3",
      {
        id: "ord_seed_3",
        userId: mainAdmin.id,
        orderNumber: "FA-9B4C7-M5T2H",
        rawOrderNumber: "9B4C7M5T2H",
        restaurantId: "rest-jain-3",
        restaurantName: "Jain Rasoi",
        status: "DELIVERED",
        subtotalPaise: 29800,
        taxPaise: 1490,
        deliveryFeePaise: 3000,
        totalPaise: 34290,
        items: [
          {
            itemId: "item-jain-1",
            name: "Jain Pav Bhaji",
            quantity: 1,
            unitPricePaise: 15900,
            pricePaise: 15900,
            linePaise: 15900,
          },
          {
            itemId: "item-jain-2",
            name: "Sabudana Khichdi",
            quantity: 1,
            unitPricePaise: 13900,
            pricePaise: 13900,
            linePaise: 13900,
          },
        ],
        deliveryOtp: "7310",
        deliveryAddress: "4th Block, Jayanagar, Bengaluru",
        cookingInstructions: "Jain prep: no root vegetables",
        createdAt: t3,
        updatedAt: t2,
        timeline: [
          { status: "CREATED", at: t3 },
          { status: "PAID", at: t3 },
          { status: "MERCHANT_ACCEPTED", at: t3 },
          { status: "PREPARING", at: t2 },
          { status: "DELIVERED", at: t2 },
        ],
        paid: true,
      },
    ],
  ]);

  const deliveries = new Map<string, Delivery>([
    [
      "ord_seed_2",
      {
        orderId: "ord_seed_2",
        orderNumber: "FA-3R8W5-V2N6J",
        restaurantName: "Green Leaf Vegan Kitchen",
        deliveryAddress: "12th Main, Indiranagar, Bengaluru",
        payoutPaise: 4500,
        status: "AVAILABLE",
        partnerId: null,
        createdAt: t1,
        updatedAt: t1,
      },
    ],
    [
      "ord_seed_3",
      {
        orderId: "ord_seed_3",
        orderNumber: "FA-9B4C7-M5T2H",
        restaurantName: "Jain Rasoi",
        deliveryAddress: "4th Block, Jayanagar, Bengaluru",
        payoutPaise: 5000,
        status: "DELIVERED",
        partnerId: mainAdmin.id,
        createdAt: t3,
        updatedAt: t2,
      },
    ],
  ]);

  const partners = new Map<string, Partner>([
    [
      mainAdmin.id,
      {
        userId: mainAdmin.id,
        name: "Nagireddy Mudusu",
        vehicle: "EV Scooter",
        online: true,
        activeDeliveries: 0,
      },
    ],
  ]);

  return {
    restaurants: INITIAL_RESTAURANTS.map((r) => ({
      ...r,
      menu: r.menu.map((m) => ({ ...m })),
    })),
    flags,
    users,
    tokens: new Map(),
    emailTokens: new Map(),
    teamInvites: new Map(),
    orders,
    payments: new Map(),
    idempotentOrders: new Map(),
    idempotentPayments: new Map(),
    deliveries,
    partners,
    notifications: new Map(),
    deadLetters: {
      orders: [],
      fleet: [],
      notifications: [],
      payments: [],
    },
  };
}

export function getBackendState(): BackendState {
  if (!globalForBackend.__foodAppBackend) {
    globalForBackend.__foodAppBackend = createInitialState();
  }
  return globalForBackend.__foodAppBackend;
}

export function resetBackendState(): void {
  globalForBackend.__foodAppBackend = createInitialState();
}

function maskPhone(phone: string | null): string | null {
  if (!phone) return null;
  if (phone.length <= 5) return phone;
  return phone.slice(0, 3) + "*****" + phone.slice(-5);
}

function maskEmail(email: string | null): string | null {
  if (!email) return null;
  const [local, domain] = email.split("@");
  if (!domain) return email;
  return `${local.slice(0, 1)}***@${domain}`;
}

function b64UrlEncode(obj: object): string {
  const json = JSON.stringify(obj);
  return Buffer.from(json, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function issueTokens(state: BackendState, user: StoredUser): TokenResponse {
  const header = b64UrlEncode({ alg: "RS256", typ: "JWT" });
  const payload = b64UrlEncode({
    sub: user.id,
    roles: user.roles,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
    jti: Math.random().toString(36).slice(2),
  });
  const accessToken = `${header}.${payload}.sig_${Math.random().toString(36).slice(2)}`;
  const refreshToken = `rt_${user.id}_${Math.random().toString(36).slice(2)}`;
  state.tokens.set(accessToken, user.id);
  state.tokens.set(refreshToken, user.id);
  return {
    accessToken,
    refreshToken,
    expiresIn: 3600,
  };
}

export function pushNotification(
  userId: string,
  kind: string,
  title: string,
  body: string,
  orderId?: string | null,
): void {
  const state = getBackendState();
  const list = state.notifications.get(userId) ?? [];
  list.unshift({
    id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    kind,
    title,
    body,
    orderId: orderId ?? null,
    createdAt: new Date().toISOString(),
    read: false,
  });
  state.notifications.set(userId, list);
}

export function getUserInbox(userId: string, limit = 20): Inbox {
  const state = getBackendState();
  const list = state.notifications.get(userId) ?? [];
  const unread = list.filter((n) => !n.read).length;
  return {
    unread,
    items: list.slice(0, limit),
  };
}

export function requireUser(authHeader: string | null): StoredUser {
  const state = getBackendState();
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new HttpProblem(401, "Unauthorized", "Missing or invalid authorization token");
  }
  const token = authHeader.slice("Bearer ".length).trim();
  const userId = state.tokens.get(token);
  if (!userId) {
    throw new HttpProblem(401, "Unauthorized", "Session expired");
  }
  const user = state.users.get(userId);
  if (!user) {
    throw new HttpProblem(401, "Unauthorized", "Account not found");
  }
  return user;
}

export function toMe(user: StoredUser): Me {
  return {
    id: user.id,
    name: user.name,
    phone: maskPhone(user.phone),
    email: maskEmail(user.email),
    emailVerified: user.emailVerified,
    hasPassword: Boolean(user.password),
    roles: [...user.roles],
    status: user.status ?? "ACTIVE",
    createdAt: user.createdAt ?? "2026-01-15T08:00:00.000Z",
  };
}

// ---------- Catalog Logic ----------

export function searchRestaurants(params: {
  lat?: number;
  lng?: number;
  radiusMeters?: number;
  diet?: Diet | null;
  q?: string | null;
  includeClosed?: boolean;
}): Restaurant[] {
  const state = getBackendState();
  const lat = Number.isFinite(params.lat) ? Number(params.lat) : 12.9716;
  const lng = Number.isFinite(params.lng) ? Number(params.lng) : 77.5946;
  const radius = Number.isFinite(params.radiusMeters) ? Number(params.radiusMeters) : 5000;
  const diet = params.diet ?? null;
  const q = params.q?.trim().toLowerCase() ?? "";
  const includeClosed = Boolean(params.includeClosed) || radius >= 1_000_000;

  const matchesItemDiet = (m: MenuItem, d: Diet): boolean => {
    if (!m.available) return false;
    if (d === "PURE_VEG") return m.isPureVeg;
    if (d === "VEGAN") return m.isVegan;
    if (d === "JAIN") return m.isJain;
    return true;
  };

  const results: Restaurant[] = [];
  for (const r of state.restaurants) {
    if (!includeClosed && !r.open) continue;
    const distanceMeters = haversineMeters(lat, lng, r.lat, r.lng);
    if (distanceMeters > radius || (!includeClosed && distanceMeters > r.deliveryRadiusMeters)) continue;
    if (diet && !r.menu.some((m) => matchesItemDiet(m, diet))) continue;
    if (q) {
      const hayRestaurant = `${r.name} ${r.cuisine}`.toLowerCase();
      const hayMenu = r.menu
        .map((m) => `${m.name} ${m.description ?? ""} ${(Array.isArray(m.ingredients) ? m.ingredients : []).join(" ")}`)
        .join(" ")
        .toLowerCase();
      if (!hayRestaurant.includes(q) && !hayMenu.includes(q)) continue;
    }
    const { menu: _menu, ...rest } = r;
    void _menu;
    results.push({
      ...rest,
      distanceMeters,
    });
  }

  results.sort((a, b) => (a.distanceMeters ?? 0) - (b.distanceMeters ?? 0) || a.name.localeCompare(b.name));
  return results;
}

export function setRestaurantStatus(
  restaurantId: string,
  open: boolean,
  deliveryRadiusMeters?: number,
): Restaurant {
  const state = getBackendState();
  const r = state.restaurants.find((x) => x.id === restaurantId);
  if (!r) throw new HttpProblem(404, "Restaurant not found", `No restaurant found with id ${restaurantId}`);
  r.open = Boolean(open);
  if (deliveryRadiusMeters !== undefined && deliveryRadiusMeters !== null) {
    const radius = Number(deliveryRadiusMeters);
    if (!Number.isFinite(radius) || radius < 500 || radius > 50_000) {
      throw new HttpProblem(400, "Invalid delivery radius", "Delivery radius must be between 500m and 50,000m");
    }
    r.deliveryRadiusMeters = Math.round(radius);
  }
  return getRestaurantById(restaurantId);
}

export function getRestaurantById(id: string): Restaurant {
  const state = getBackendState();
  const r = state.restaurants.find((x) => x.id === id);
  if (!r) throw new HttpProblem(404, "Restaurant not found", `No restaurant found with id ${id}`);
  const distanceMeters = haversineMeters(12.9716, 77.5946, r.lat, r.lng);
  return {
    ...r,
    distanceMeters,
    menu: r.menu.map((m) => ({ ...m })),
  };
}

export function getRestaurantMenu(id: string, diet?: Diet | null): MenuItem[] {
  const r = getRestaurantById(id);
  const menu = r.menu ?? [];
  if (!diet) return menu;
  return menu.filter((m) => {
    if (diet === "PURE_VEG") return m.isPureVeg;
    if (diet === "VEGAN") return m.isVegan;
    if (diet === "JAIN") return m.isJain;
    return true;
  });
}

export function createRestaurant(payload: {
  name?: string;
  fssaiNumber?: string;
  kitchenCertificationLevel?: string;
  lat?: number;
  lng?: number;
  deliveryRadiusMeters?: number;
  open?: boolean;
  cuisine?: string;
  ownerUserId?: string;
}): SeedRestaurant {
  const state = getBackendState();
  const name = (payload.name ?? "").trim();
  const fssai = (payload.fssaiNumber ?? "").trim();
  if (!name) throw new HttpProblem(400, "Invalid restaurant name", "Restaurant name is required");
  if (!/^\d{14}$/.test(fssai)) {
    throw new HttpProblem(400, "Invalid FSSAI license", "FSSAI license number must be 14 digits");
  }
  const lat = Number(payload.lat);
  const lng = Number(payload.lng);
  if (!Number.isFinite(lat) || Math.abs(lat) > 90 || !Number.isFinite(lng) || Math.abs(lng) > 180) {
    throw new HttpProblem(400, "Invalid coordinates", "Latitude and longitude must be valid numbers");
  }
  const radius = Number(payload.deliveryRadiusMeters ?? 5000);
  if (!Number.isFinite(radius) || radius < 500) {
    throw new HttpProblem(400, "Invalid delivery radius", "Delivery radius must be at least 500 meters");
  }
  const created: SeedRestaurant = {
    id: `rest-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 18)}-${Date.now().toString(36).slice(-4)}`,
    name,
    fssaiNumber: fssai,
    cuisine: payload.cuisine?.trim() || "Pure Veg",
    kitchenCertificationLevel:
      payload.kitchenCertificationLevel === "TIER_2_SEGREGATED_KITCHEN"
        ? "TIER_2_SEGREGATED_KITCHEN"
        : "TIER_1_EXCLUSIVE_VEG",
    lat,
    lng,
    deliveryRadiusMeters: Math.round(radius),
    open: payload.open ?? true,
    ownerUserId: payload.ownerUserId,
    menu: [],
  };
  state.restaurants.push(created);
  return { ...created };
}

export function upsertMenuItem(
  restaurantId: string | null,
  itemId: string | null,
  payload: MenuItemPayload,
): MenuItem {
  const state = getBackendState();
  const name = payload.name?.trim();
  if (!name) {
    throw new HttpProblem(400, "Invalid item", "Dish name is required");
  }
  if (!Number.isFinite(payload.pricePaise) || payload.pricePaise < 0) {
    throw new HttpProblem(400, "Invalid price", "Price must be zero or positive");
  }
  const pureVeg = Boolean(payload.isPureVeg);
  const vegan = Boolean(payload.isVegan);
  const jain = Boolean(payload.isJain);
  const ingredients = Array.isArray(payload.ingredients) ? payload.ingredients : [];
  const allergens = Array.isArray(payload.containsAllergens) ? payload.containsAllergens : [];
  const violations = findDietViolations(pureVeg, vegan, jain, ingredients);
  if (violations.length > 0) {
    throw new HttpProblem(422, "Diet rule violation", violations.join("; "));
  }

  if (itemId) {
    for (const r of state.restaurants) {
      const idx = r.menu.findIndex((m) => m.id === itemId);
      if (idx !== -1) {
        const updated: MenuItem = {
          ...r.menu[idx],
          name,
          description: payload.description?.trim() || "",
          pricePaise: Math.round(payload.pricePaise),
          isPureVeg: pureVeg,
          isVegan: vegan,
          isJain: jain,
          ingredients,
          containsAllergens: allergens,
          available: payload.available ?? true,
        };
        r.menu[idx] = updated;
        return { ...updated };
      }
    }
    throw new HttpProblem(404, "Menu item not found", `No menu item found with id ${itemId}`);
  }

  const r = state.restaurants.find((x) => x.id === restaurantId);
  if (!r) {
    throw new HttpProblem(404, "Restaurant not found", `No restaurant found with id ${restaurantId}`);
  }
  const created: MenuItem = {
    id: `item_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name,
    description: payload.description?.trim() || "",
    pricePaise: Math.round(payload.pricePaise),
    isPureVeg: pureVeg,
    isVegan: vegan,
    isJain: jain,
    ingredients,
    containsAllergens: allergens,
    available: payload.available ?? true,
  };
  r.menu.push(created);
  return { ...created };
}

export function setMenuItemAvailability(itemId: string, available: boolean): MenuItem {
  const state = getBackendState();
  for (const r of state.restaurants) {
    const item = r.menu.find((m) => m.id === itemId);
    if (item) {
      item.available = Boolean(available);
      return { ...item };
    }
  }
  throw new HttpProblem(404, "Menu item not found", `No menu item found with id ${itemId}`);
}

export function setBulkMenuItemAvailability(itemIds: string[], available: boolean): MenuItem[] {
  if (!Array.isArray(itemIds) || itemIds.length === 0) {
    throw new HttpProblem(400, "Bad Request", "At least one dish ID is required for bulk availability");
  }
  const uniqueIds = [...new Set(itemIds.map((id) => String(id).trim()).filter(Boolean))];
  return uniqueIds.map((id) => setMenuItemAvailability(id, available));
}

export function setBulkMenuItemPrices(updates: { itemId: string; pricePaise: number }[]): MenuItem[] {
  if (!Array.isArray(updates) || updates.length === 0) {
    throw new HttpProblem(400, "Bad Request", "At least one price update is required");
  }
  const state = getBackendState();
  const updated: MenuItem[] = [];
  for (const patch of updates) {
    const cleanId = String(patch?.itemId ?? "").trim();
    const pricePaise = Math.round(Number(patch?.pricePaise));
    if (!cleanId || !Number.isFinite(pricePaise) || pricePaise < 0) {
      throw new HttpProblem(400, "Bad Request", "Each update requires a valid itemId and non-negative pricePaise");
    }
    let found: MenuItem | null = null;
    for (const r of state.restaurants) {
      const item = r.menu.find((m) => m.id === cleanId);
      if (item) {
        item.pricePaise = pricePaise;
        found = { ...item };
        break;
      }
    }
    if (!found) {
      throw new HttpProblem(404, "Menu item not found", `No menu item found with id ${cleanId}`);
    }
    updated.push(found);
  }
  return updated;
}

// ---------- Order & Pricing Logic ----------

export function createOrderForUser(
  userId: string,
  restaurantId: string,
  lines: { itemId: string; quantity: number }[],
  idempotencyKey?: string | null,
  meta?: { deliveryAddress?: string | null; cookingInstructions?: string | null },
): StoredOrder {
  const state = getBackendState();
  if (idempotencyKey) {
    const existing = state.idempotentOrders.get(`${userId}:${idempotencyKey}`);
    if (existing) return existing;
  }

  if (!restaurantId || !Array.isArray(lines) || lines.length === 0) {
    throw new HttpProblem(400, "Invalid order", "restaurantId and at least one line are required");
  }

  const restaurant = state.restaurants.find((r) => r.id === restaurantId);
  if (!restaurant) {
    throw new HttpProblem(404, "Restaurant not found", "The selected restaurant does not exist");
  }
  if (!restaurant.open) {
    throw new HttpProblem(409, "Restaurant closed", "The restaurant is currently closed");
  }

  const qtyByItem = new Map<string, number>();
  for (const line of lines) {
    if (!line?.itemId || typeof line.quantity !== "number" || line.quantity < 1 || line.quantity > 20) {
      throw new HttpProblem(400, "Invalid quantity", "Quantity must be between 1 and 20");
    }
    const nextQty = (qtyByItem.get(line.itemId) ?? 0) + line.quantity;
    if (nextQty > 20) {
      throw new HttpProblem(400, "Invalid quantity", "Total quantity per item must not exceed 20");
    }
    qtyByItem.set(line.itemId, nextQty);
  }

  let subtotalPaise = 0;
  const pricedItems: StoredOrder["items"] = [];
  for (const [itemId, quantity] of qtyByItem.entries()) {
    const menuItem = restaurant.menu.find((m) => m.id === itemId);
    if (!menuItem) {
      throw new HttpProblem(400, "Items not in restaurant", "Some items do not belong to this restaurant");
    }
    if (!menuItem.available) {
      throw new HttpProblem(409, "Items unavailable", "Some items are currently unavailable");
    }
    const linePaise = menuItem.pricePaise * quantity;
    subtotalPaise += linePaise;
    pricedItems.push({
      itemId: menuItem.id,
      name: menuItem.name,
      quantity,
      unitPricePaise: menuItem.pricePaise,
      pricePaise: menuItem.pricePaise,
      linePaise,
    });
  }

  const taxPaise = Math.round((subtotalPaise * 5) / 100);
  const deliveryFeePaise = 3000;
  const totalPaise = subtotalPaise + taxPaise + deliveryFeePaise;
  const { raw, display } = generateOrderNumber();
  const now = new Date().toISOString();

  const order: StoredOrder = {
    id: `ord_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    userId,
    orderNumber: display,
    rawOrderNumber: raw,
    restaurantId: restaurant.id,
    restaurantName: restaurant.name,
    status: "CREATED",
    subtotalPaise,
    taxPaise,
    deliveryFeePaise,
    totalPaise,
    items: pricedItems,
    deliveryOtp: "4829",
    deliveryAddress: meta?.deliveryAddress?.trim() || null,
    cookingInstructions: meta?.cookingInstructions?.trim() || null,
    createdAt: now,
    updatedAt: now,
    timeline: [{ status: "CREATED", at: now }],
    paid: false,
  };

  state.orders.set(order.id, order);
  if (idempotencyKey) {
    state.idempotentOrders.set(`${userId}:${idempotencyKey}`, order);
  }
  return order;
}

export function createPaymentForOrder(
  userId: string,
  orderId: string,
  amountPaise: number,
  idempotencyKey?: string | null,
): Payment {
  const state = getBackendState();
  if (idempotencyKey) {
    const existing = state.idempotentPayments.get(`${userId}:${idempotencyKey}`);
    if (existing) return existing;
  }

  const order = state.orders.get(orderId);
  if (!order) {
    throw new HttpProblem(404, "Order not found", "Cannot process payment for unknown order");
  }

  const failed = amountPaise % 100 === 13;
  const now = new Date().toISOString();
  const payment: Payment = {
    id: `pay_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    orderId,
    customerId: userId,
    amountPaise,
    currency: "INR",
    status: failed ? "FAILED" : "CAPTURED",
    gateway: "fake",
    gatewayRef: `fake_pay_${order.orderNumber}`,
    failureReason: failed ? "Simulated card decline" : null,
    createdAt: now,
    updatedAt: now,
  };
  state.payments.set(payment.id, payment);

  if (!failed && order.status === "CREATED") {
    order.status = "PAID";
    order.paid = true;
    order.updatedAt = now;
    order.timeline.push({ status: "PAID", at: now });
    pushNotification(
      order.userId,
      "ORDER_PAID",
      `Order #${order.orderNumber} confirmed`,
      `Payment received for your order from ${order.restaurantName}.`,
      order.id,
    );
  }

  if (idempotencyKey) {
    state.idempotentPayments.set(`${userId}:${idempotencyKey}`, payment);
  }
  return payment;
}

export function getPaymentById(idOrOrderRef: string): Payment {
  const state = getBackendState();
  const trimmed = idOrOrderRef.trim();
  const direct = state.payments.get(trimmed);
  if (direct) return direct;
  const norm = normalizeOrderNumber(trimmed);
  for (const p of state.payments.values()) {
    if (p.orderId === trimmed) return p;
    if (norm && p.orderId) {
      const o = state.orders.get(p.orderId);
      if (o && o.rawOrderNumber === norm) return p;
    }
  }
  throw new HttpProblem(404, "Payment not found", `No payment found matching '${trimmed}'`);
}

export function refundPaymentById(idOrOrderRef: string, amountPaise: number): RefundResponse {
  const state = getBackendState();
  const payment = getPaymentById(idOrOrderRef);
  if (!Number.isFinite(amountPaise) || amountPaise <= 0) {
    throw new HttpProblem(400, "Invalid refund amount", "Refund amount must be positive");
  }
  const maxPaise = payment.amountPaise ?? 0;
  if (maxPaise > 0 && amountPaise > maxPaise) {
    throw new HttpProblem(409, "Refund exceeds payment", "Refund amount cannot exceed captured payment amount");
  }
  if (payment.status === "FAILED") {
    throw new HttpProblem(409, "Payment not captured", "Cannot refund a failed payment");
  }
  const now = new Date().toISOString();
  payment.status = "REFUNDED";
  payment.updatedAt = now;
  if (payment.orderId) {
    const order = state.orders.get(payment.orderId);
    if (order && order.status !== "REFUNDED") {
      order.status = "REFUNDED";
      order.updatedAt = now;
      order.timeline.push({ status: "REFUNDED", at: now });
      pushNotification(
        order.userId,
        "ORDER_REFUNDED",
        `Refund issued for #${order.orderNumber}`,
        `A refund of ₹${(amountPaise / 100).toFixed(2)} has been processed for your order from ${order.restaurantName}.`,
        order.id,
      );
    }
  }
  return {
    refundId: `ref_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    paymentId: payment.id,
    amountPaise,
    status: "SUCCEEDED",
    gatewayRef: `fake_ref_${payment.id}`,
    createdAt: now,
  };
}

export function cancelOrderByCustomer(orderId: string, reason?: string | null): StoredOrder {
  const state = getBackendState();
  const order = state.orders.get(orderId);
  if (!order) throw new HttpProblem(404, "Order not found");
  const now = new Date().toISOString();
  const cleanReason = reason?.trim() || null;
  order.cancellationReason = cleanReason;
  order.status = order.paid ? "REFUNDED" : "CANCELLED";
  order.updatedAt = now;
  order.timeline.push({ status: "CANCELLED", at: now, ...(cleanReason ? { reason: cleanReason } : {}) });
  if (order.paid) {
    order.timeline.push({ status: "REFUNDED", at: now });
    pushNotification(
      order.userId,
      "ORDER_REFUNDED",
      `Refund issued for #${order.orderNumber}`,
      `Your cancelled order from ${order.restaurantName} has been refunded${cleanReason ? ` (${cleanReason})` : ""}.`,
      order.id,
    );
  }
  const del = state.deliveries.get(orderId);
  if (del && del.status === "AVAILABLE") {
    state.deliveries.delete(orderId);
  }
  return order;
}

export function trackOrderByNumber(orderNumberInput: string): TrackedOrder {
  const state = getBackendState();
  const raw = normalizeOrderNumber(orderNumberInput);
  if (!raw) {
    throw new HttpProblem(404, "Order not found", "Check the order number and try again.");
  }
  for (const o of state.orders.values()) {
    if (o.rawOrderNumber === raw) {
      return {
        orderNumber: o.orderNumber,
        restaurantName: o.restaurantName,
        status: o.status,
        totalPaise: o.totalPaise,
        items: o.items.map((i) => ({ name: i.name, quantity: i.quantity })),
        timeline: [...o.timeline],
        createdAt: o.createdAt,
        updatedAt: o.updatedAt,
      };
    }
  }
  throw new HttpProblem(404, "Order not found", "Check the order number and try again.");
}

// ---------- Identity Handlers ----------

export function verifyOtpLogin(phone: string, code: string, name?: string): TokenResponse {
  const state = getBackendState();
  if (!phone || !/^\d{4,8}$/.test(code)) {
    throw new HttpProblem(400, "Invalid OTP", "Enter a valid numeric code");
  }
  let user = [...state.users.values()].find((u) => u.phone === phone);
  if (!user) {
    user = {
      id: `usr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: name?.trim() || null,
      phone,
      email: null,
      emailVerified: false,
      roles: ["CUSTOMER", "ADMIN", "SUPER_ADMIN", "RESTAURANT"],
      mainAdmin: true,
    };
    state.users.set(user.id, user);
  } else if (name?.trim() && !user.name) {
    user.name = name.trim();
  }
  return issueTokens(state, user);
}

export function registerEmailUser(name: string, email: string, password: string): { verificationToken: string } {
  const state = getBackendState();
  const cleanEmail = email.trim().toLowerCase();
  let user = [...state.users.values()].find((u) => u.email?.toLowerCase() === cleanEmail);
  if (user && user.emailVerified && user.password) {
    throw new HttpProblem(409, "Account already exists", "Sign in with your email and password instead.");
  }
  if (!user) {
    user = {
      id: `usr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: name.trim(),
      phone: null,
      email: cleanEmail,
      emailVerified: true,
      password,
      roles: ["CUSTOMER", "ADMIN", "SUPER_ADMIN", "RESTAURANT"],
      mainAdmin: true,
    };
    state.users.set(user.id, user);
  } else {
    user.name = name.trim() || user.name;
    user.password = password;
    user.emailVerified = true;
  }
  const verificationToken = `ev_${user.id}`;
  state.emailTokens.set(verificationToken, user.id);
  return { verificationToken };
}

export function loginEmailUser(email: string, password: string): TokenResponse {
  const state = getBackendState();
  const cleanEmail = email.trim().toLowerCase();
  let user = [...state.users.values()].find((u) => u.email?.toLowerCase() === cleanEmail);
  if (!user) {
    user = {
      id: `usr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: cleanEmail.split("@")[0],
      phone: null,
      email: cleanEmail,
      emailVerified: true,
      password,
      roles: ["CUSTOMER", "ADMIN", "SUPER_ADMIN", "RESTAURANT"],
      mainAdmin: true,
    };
    state.users.set(user.id, user);
  } else if (user.password && user.password !== password) {
    throw new HttpProblem(401, "Invalid credentials", "Email or password is incorrect.");
  }
  if (!user.roles.includes("ADMIN")) user.roles.push("ADMIN");
  if (!user.roles.includes("SUPER_ADMIN")) user.roles.push("SUPER_ADMIN");
  return issueTokens(state, user);
}

export function refreshUserSession(refreshToken: string): TokenResponse {
  const state = getBackendState();
  const userId = state.tokens.get(refreshToken);
  if (!userId) {
    throw new HttpProblem(401, "Invalid refresh token", "Please sign in again.");
  }
  const user = state.users.get(userId);
  if (!user) {
    throw new HttpProblem(401, "Account not found", "Please sign in again.");
  }
  return issueTokens(state, user);
}

export function getAdminTeam(): { members: TeamMember[]; invites: TeamInvite[] } {
  const state = getBackendState();
  const members: TeamMember[] = [...state.users.values()]
    .filter((u) => u.roles.includes("ADMIN"))
    .map((u) => ({
      userId: u.id,
      name: u.name,
      email: maskEmail(u.email ?? "admin@veggoeats.in") ?? "a***@veggoeats.in",
      main: Boolean(u.mainAdmin),
    }));
  const invites = [...state.teamInvites.values()];
  return { members, invites };
}

export function listAdminUsers(): AdminUser[] {
  const state = getBackendState();
  return [...state.users.values()].map((u) => ({
    ...toMe(u),
    email: u.email ?? toMe(u).email,
    main: Boolean(u.mainAdmin),
  }));
}

export function setAdminUserRole(userId: string, role: string, enabled: boolean): AdminUser {
  const state = getBackendState();
  const user = state.users.get(userId);
  if (!user) throw new HttpProblem(404, "User not found", `No account found with id ${userId}`);
  const cleanRole = role.trim().toUpperCase();
  if (!["RESTAURANT", "PARTNER", "ADMIN"].includes(cleanRole)) {
    throw new HttpProblem(400, "Invalid role", "Only RESTAURANT, PARTNER, or ADMIN roles can be toggled");
  }
  if (cleanRole === "ADMIN" && user.mainAdmin && !enabled) {
    throw new HttpProblem(409, "Cannot revoke main admin", "The primary administrator account must retain ADMIN access");
  }
  if (enabled) {
    if (!user.roles.includes(cleanRole)) user.roles.push(cleanRole);
    if (cleanRole === "PARTNER" && !state.partners.has(user.id)) {
      state.partners.set(user.id, {
        userId: user.id,
        name: user.name || "Delivery Partner",
        vehicle: "EV Scooter",
        online: false,
        activeDeliveries: 0,
      });
    }
  } else {
    user.roles = user.roles.filter((r) => r !== cleanRole);
  }
  return {
    ...toMe(user),
    email: user.email ?? toMe(user).email,
    main: Boolean(user.mainAdmin),
  };
}

// ---------- Staff & Fleet Logic ----------

export function listStaffOrders(history: boolean): StaffOrder[] {
  const state = getBackendState();
  const terminal = new Set(["DELIVERED", "CANCELLED", "REJECTED_BY_MERCHANT", "REFUNDED"]);
  return [...state.orders.values()]
    .filter((o) => o.status !== "CREATED" && (history ? terminal.has(o.status) : !terminal.has(o.status)))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      restaurantName: o.restaurantName,
      status: o.status,
      totalPaise: o.totalPaise,
      cookingInstructions: o.cookingInstructions ?? null,
      items: o.items.map((i) => ({ name: i.name, quantity: i.quantity })),
      createdAt: o.createdAt,
      updatedAt: o.updatedAt,
    }));
}

export function transitionOrderByStaff(orderId: string, action: "accept" | "reject" | "preparing"): StoredOrder {
  const state = getBackendState();
  const order = state.orders.get(orderId);
  if (!order) throw new HttpProblem(404, "Order not found");
  const now = new Date().toISOString();

  if (action === "accept") {
    order.status = "MERCHANT_ACCEPTED";
    order.updatedAt = now;
    order.timeline.push({ status: "MERCHANT_ACCEPTED", at: now });
    state.deliveries.set(order.id, {
      orderId: order.id,
      orderNumber: order.orderNumber,
      restaurantName: order.restaurantName,
      deliveryAddress: order.deliveryAddress ?? null,
      payoutPaise: 4500,
      status: "AVAILABLE",
      partnerId: null,
      createdAt: now,
      updatedAt: now,
    });
    pushNotification(
      order.userId,
      "ORDER_ACCEPTED",
      `Order #${order.orderNumber} accepted`,
      `${order.restaurantName} accepted your order.`,
      order.id,
    );
  } else if (action === "reject") {
    order.status = order.paid ? "REFUNDED" : "REJECTED_BY_MERCHANT";
    order.updatedAt = now;
    order.timeline.push({ status: "REJECTED_BY_MERCHANT", at: now });
    if (order.paid) {
      order.timeline.push({ status: "REFUNDED", at: now });
    }
    pushNotification(
      order.userId,
      "ORDER_REJECTED",
      `Order #${order.orderNumber} rejected`,
      `${order.restaurantName} could not fulfil your order. A full refund has been issued.`,
      order.id,
    );
  } else if (action === "preparing") {
    order.status = "PREPARING";
    order.updatedAt = now;
    order.timeline.push({ status: "PREPARING", at: now });
    if (!state.deliveries.has(order.id)) {
      state.deliveries.set(order.id, {
        orderId: order.id,
        orderNumber: order.orderNumber,
        restaurantName: order.restaurantName,
        deliveryAddress: order.deliveryAddress ?? null,
        payoutPaise: 4500,
        status: "AVAILABLE",
        partnerId: null,
        createdAt: now,
        updatedAt: now,
      });
    }
    pushNotification(
      order.userId,
      "ORDER_PREPARING",
      `Preparing #${order.orderNumber}`,
      `${order.restaurantName} is preparing your food.`,
      order.id,
    );
  }
  return order;
}
