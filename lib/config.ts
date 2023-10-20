// Web Server
export const sessionOptions = {
  cookieName: "__rat.session",
  password: process.env.SESSION_SECRET || "",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
  },
  expireDays: 31,
};

export type ServerAuthObject = {
  server: boolean;
  game: string;
  id: any;
  timestamp: Date;
};

// Game
export enum Team {
  A,
  B,
}

export enum HeroClass {
  Damage = 0,
  Tank,
  Support,
}

export enum AbilityType {
  Targetable = 0,
  AOE,
  Instant,
  Passive,
}

export enum UnitTargetType {
  Player = 0,
}

export enum UnitDamageType {
  Physical = 0,
  Magical,
}

export type AbilityStat = {
  type: AbilityType;
  uri: string;
  isOnCastbar: boolean;
  unitTargetType: UnitTargetType;
  unitDamageType: UnitDamageType;
  hasOverpower: boolean;
  overpowerDescription: string;
  requiredLevel: number;
  castRange: number;
  cooldown: number;
  hasDamage: boolean;
  damage: number;
  isChanneled: boolean;
  channelTime?: number;
  isUltimate: boolean;
  castTime: number;
  hasCharges: boolean;
  charges: number;
  chargeRestoreTime: number; // in seconds
  dispellable: boolean;
};

export type GameVersion = {
  id: string;
  Heroes: Hero[];
};

export type Ability = {
  id: string;
  name: string;
  heroId: string;
  stat: AbilityStat;
};

export type HeroStat = {
  primaryDamageType: UnitDamageType;
  autoAttackDamage: number;
  class: HeroClass;
};

export type Hero = {
  id: string;
  name: string;
  uri: string;
  description: string;
  stat: HeroStat;
  gameVersionId: string;
  abilities: Ability[];
  gameVersion: GameVersion;
};

// Game Coordinator
export enum GameType {
  NONE,
  CUSTOM,
  RANKED,
}

export const gametypeConfig = {
  [GameType.NONE]: {
    playersRequired: 0,
  },
  [GameType.CUSTOM]: {
    playersRequired: 1,
  },
  [GameType.RANKED]: {
    playersRequired: 1,
  },
};

export enum Region {
  LOCAL,
  AU,
}
