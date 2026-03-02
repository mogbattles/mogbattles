export interface TierInfo {
  name: string;
  iconUrl: string;
  minElo: number;
  maxElo: number;
  cssClass: string;
  isSpecial: boolean;
}

const TIERS: TierInfo[] = [
  {
    name: "NGMI",
    iconUrl: "https://pbs.twimg.com/media/GKBgTQfWQAAov1a.jpg",
    minElo: 0, maxElo: 799,
    cssClass: "tier-ngmi", isSpecial: false,
  },
  {
    name: "Low Tier Normie",
    iconUrl: "https://ih1.redbubble.net/image.5243115693.9081/bg,f8f8f8-flat,750x,075,f-pad,750x1000,f8f8f8.u1.jpg",
    minElo: 800, maxElo: 999,
    cssClass: "tier-low-normie", isSpecial: false,
  },
  {
    name: "Mid Tier Normie",
    iconUrl: "https://upload.wikimedia.org/wikipedia/en/c/cc/Wojak_cropped.jpg",
    minElo: 1000, maxElo: 1199,
    cssClass: "tier-mid-normie", isSpecial: false,
  },
  {
    name: "High Tier Normie",
    iconUrl: "https://miro.medium.com/1*cGTlAfkrSpgAD84zWDNxXQ.png",
    minElo: 1200, maxElo: 1399,
    cssClass: "tier-high-normie", isSpecial: false,
  },
  {
    name: "Chadlite",
    iconUrl: "https://i.redd.it/wojak-baby-chad-meme-hd-png-psd-resolution-3600x3200-v0-javu13kbpb3g1.png?width=3600&format=png&auto=webp&s=48468f9f13b59b6a4683d0cf2dfb95671cbd702f",
    minElo: 1400, maxElo: 1599,
    cssClass: "tier-chadlite", isSpecial: false,
  },
  {
    name: "Chad",
    iconUrl: "https://i.imgflip.com/7u5nhi.png",
    minElo: 1600, maxElo: 1799,
    cssClass: "tier-chad", isSpecial: false,
  },
  {
    name: "Gigachad",
    iconUrl: "https://i.redd.it/60wo0uuqljhd1.jpeg",
    minElo: 1800, maxElo: 1999,
    cssClass: "tier-gigachad", isSpecial: false,
  },
  {
    name: "PSL God",
    iconUrl: "https://i.pinimg.com/236x/7a/d0/c4/7ad0c4c265bbad940717fac08ec69e11.jpg",
    minElo: 2000, maxElo: Infinity,
    cssClass: "tier-psl-god", isSpecial: true,
  },
];

export function getTier(elo: number): TierInfo {
  return TIERS.find(t => elo >= t.minElo && elo <= t.maxElo) ?? TIERS[0];
}

export { TIERS };
