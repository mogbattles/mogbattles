export interface TierInfo {
  name: string;
  iconUrl: string;
  minElo: number;
  maxElo: number;
  cssClass: string;
  isSpecial: boolean;
  rating: string;
  percentile: string;
}

// ─── Men's Tier System ──────────────────────────────────────────────────────

const MALE_TIERS: TierInfo[] = [
  {
    name: "Low Subhuman",
    iconUrl: "https://pbs.twimg.com/media/GKBgTQfWQAAov1a.jpg",
    minElo: 0, maxElo: 399,
    cssClass: "tier-low-subhuman", isSpecial: false,
    rating: "1-2/10", percentile: "0-1.11",
  },
  {
    name: "Subhuman",
    iconUrl: "https://pbs.twimg.com/media/GKBgTQfWQAAov1a.jpg",
    minElo: 400, maxElo: 599,
    cssClass: "tier-subhuman", isSpecial: false,
    rating: "2.1-3/10", percentile: "1.11-4.30",
  },
  {
    name: "High Subhuman",
    iconUrl: "https://pbs.twimg.com/media/GKBgTQfWQAAov1a.jpg",
    minElo: 600, maxElo: 699,
    cssClass: "tier-high-subhuman", isSpecial: false,
    rating: "3.1-3.9/10", percentile: "4.30-7.62",
  },
  {
    name: "LTN-",
    iconUrl: "https://ih1.redbubble.net/image.5243115693.9081/bg,f8f8f8-flat,750x,075,f-pad,750x1000,f8f8f8.u1.jpg",
    minElo: 700, maxElo: 799,
    cssClass: "tier-ltn-minus", isSpecial: false,
    rating: "4/10", percentile: "7.62-12.60",
  },
  {
    name: "LTN",
    iconUrl: "https://ih1.redbubble.net/image.5243115693.9081/bg,f8f8f8-flat,750x,075,f-pad,750x1000,f8f8f8.u1.jpg",
    minElo: 800, maxElo: 899,
    cssClass: "tier-ltn", isSpecial: false,
    rating: "4.5/10", percentile: "12.60-19.49",
  },
  {
    name: "LTN+",
    iconUrl: "https://ih1.redbubble.net/image.5243115693.9081/bg,f8f8f8-flat,750x,075,f-pad,750x1000,f8f8f8.u1.jpg",
    minElo: 900, maxElo: 999,
    cssClass: "tier-ltn-plus", isSpecial: false,
    rating: "5/10", percentile: "19.49-28.29",
  },
  {
    name: "MTN-",
    iconUrl: "https://upload.wikimedia.org/wikipedia/en/c/cc/Wojak_cropped.jpg",
    minElo: 1000, maxElo: 1099,
    cssClass: "tier-mtn-minus", isSpecial: false,
    rating: "5.5/10", percentile: "28.29-38.65",
  },
  {
    name: "MTN",
    iconUrl: "https://upload.wikimedia.org/wikipedia/en/c/cc/Wojak_cropped.jpg",
    minElo: 1100, maxElo: 1199,
    cssClass: "tier-mtn", isSpecial: false,
    rating: "6/10", percentile: "38.65-49.89",
  },
  {
    name: "MTN+",
    iconUrl: "https://upload.wikimedia.org/wikipedia/en/c/cc/Wojak_cropped.jpg",
    minElo: 1200, maxElo: 1299,
    cssClass: "tier-mtn-plus", isSpecial: false,
    rating: "6.5/10", percentile: "49.89-61.14",
  },
  {
    name: "HTN-",
    iconUrl: "https://miro.medium.com/1*cGTlAfkrSpgAD84zWDNxXQ.png",
    minElo: 1300, maxElo: 1399,
    cssClass: "tier-htn-minus", isSpecial: false,
    rating: "7/10", percentile: "61.14-71.52",
  },
  {
    name: "HTN",
    iconUrl: "https://miro.medium.com/1*cGTlAfkrSpgAD84zWDNxXQ.png",
    minElo: 1400, maxElo: 1499,
    cssClass: "tier-htn", isSpecial: false,
    rating: "7.5/10", percentile: "71.52-80.35",
  },
  {
    name: "HTN+",
    iconUrl: "https://miro.medium.com/1*cGTlAfkrSpgAD84zWDNxXQ.png",
    minElo: 1500, maxElo: 1599,
    cssClass: "tier-htn-plus", isSpecial: false,
    rating: "8/10", percentile: "80.35-87.29",
  },
  {
    name: "Chadlite",
    iconUrl: "https://i.redd.it/wojak-baby-chad-meme-hd-png-psd-resolution-3600x3200-v0-javu13kbpb3g1.png?width=3600&format=png&auto=webp&s=48468f9f13b59b6a4683d0cf2dfb95671cbd702f",
    minElo: 1600, maxElo: 1699,
    cssClass: "tier-chadlite", isSpecial: false,
    rating: "8.5/10", percentile: "87.29-92.30",
  },
  {
    name: "Chad",
    iconUrl: "https://i.imgflip.com/7u5nhi.png",
    minElo: 1700, maxElo: 1799,
    cssClass: "tier-chad", isSpecial: false,
    rating: "9/10", percentile: "92.30-95.65",
  },
  {
    name: "High Chad",
    iconUrl: "https://static.wikia.nocookie.net/joke-battles/images/d/df/Gigachad.png/revision/latest?cb=20230812064835",
    minElo: 1800, maxElo: 1899,
    cssClass: "tier-high-chad", isSpecial: false,
    rating: "9.5/10", percentile: "95.65-97.71",
  },
  {
    name: "Adamlite",
    iconUrl: "https://i.pinimg.com/webp/1200x/0d/84/2a/0d842a36cabf9dad93be260444d8ffa4.webp",
    minElo: 1900, maxElo: 1999,
    cssClass: "tier-adamlite", isSpecial: true,
    rating: "9.7/10", percentile: "97.71-98.88",
  },
  {
    name: "Adam",
    iconUrl: "https://i.pinimg.com/1200x/dc/e2/cf/dce2cf504d80ffe616a39ee94e9b2350.jpg",
    minElo: 2000, maxElo: 2099,
    cssClass: "tier-adam", isSpecial: true,
    rating: "9.9/10", percentile: "98.89-99.50",
  },
  {
    name: "True Adam",
    iconUrl: "https://i.pinimg.com/webp/736x/e4/2b/cc/e42bccf89b86b5cb18190a35e164e1f6.webp",
    minElo: 2100, maxElo: Infinity,
    cssClass: "tier-true-adam", isSpecial: true,
    rating: "10/10", percentile: "99.51-100.00",
  },
];

// ─── Women's Tier System ────────────────────────────────────────────────────

const FEMALE_TIERS: TierInfo[] = [
  {
    name: "Low Subhuman",
    iconUrl: "https://i.pinimg.com/736x/40/97/1d/40971d7d4259a43e7623fc75d1998337.jpg",
    minElo: 0, maxElo: 399,
    cssClass: "tier-low-subhuman", isSpecial: false,
    rating: "1-2/10", percentile: "0-1.11",
  },
  {
    name: "Subhuman",
    iconUrl: "https://i.pinimg.com/736x/6b/57/33/6b5733e177f7e66189f5087f13be0fd8.jpg",
    minElo: 400, maxElo: 599,
    cssClass: "tier-subhuman", isSpecial: false,
    rating: "2.1-3/10", percentile: "1.11-4.30",
  },
  {
    name: "High Subhuman",
    iconUrl: "https://i.pinimg.com/736x/6b/57/33/6b5733e177f7e66189f5087f13be0fd8.jpg",
    minElo: 600, maxElo: 699,
    cssClass: "tier-high-subhuman", isSpecial: false,
    rating: "3.1-3.9/10", percentile: "4.30-7.62",
  },
  {
    name: "LTB-",
    iconUrl: "https://ih1.redbubble.net/image.1116461361.1972/bg,f8f8f8-flat,750x,075,f-pad,750x1000,f8f8f8.jpg",
    minElo: 700, maxElo: 799,
    cssClass: "tier-ltb-minus", isSpecial: false,
    rating: "4/10", percentile: "7.62-12.60",
  },
  {
    name: "LTB",
    iconUrl: "https://ih1.redbubble.net/image.1116461361.1972/bg,f8f8f8-flat,750x,075,f-pad,750x1000,f8f8f8.jpg",
    minElo: 800, maxElo: 899,
    cssClass: "tier-ltb", isSpecial: false,
    rating: "4.5/10", percentile: "12.60-19.49",
  },
  {
    name: "LTB+",
    iconUrl: "https://ih1.redbubble.net/image.1116461361.1972/bg,f8f8f8-flat,750x,075,f-pad,750x1000,f8f8f8.jpg",
    minElo: 900, maxElo: 999,
    cssClass: "tier-ltb-plus", isSpecial: false,
    rating: "5/10", percentile: "19.49-28.29",
  },
  {
    name: "MTB-",
    iconUrl: "https://i.redd.it/redhead-wojak-is-the-latest-forced-and-unfunny-meme-from-v0-reotvdm7q2uc1.jpg?width=637&format=pjpg&auto=webp&s=adc769b7b5fa8b61128504f131f90e82801e6047",
    minElo: 1000, maxElo: 1099,
    cssClass: "tier-mtb-minus", isSpecial: false,
    rating: "5.5/10", percentile: "28.29-38.65",
  },
  {
    name: "MTB",
    iconUrl: "https://i.redd.it/redhead-wojak-is-the-latest-forced-and-unfunny-meme-from-v0-reotvdm7q2uc1.jpg?width=637&format=pjpg&auto=webp&s=adc769b7b5fa8b61128504f131f90e82801e6047",
    minElo: 1100, maxElo: 1199,
    cssClass: "tier-mtb", isSpecial: false,
    rating: "6/10", percentile: "38.65-49.89",
  },
  {
    name: "MTB+",
    iconUrl: "https://i.redd.it/redhead-wojak-is-the-latest-forced-and-unfunny-meme-from-v0-reotvdm7q2uc1.jpg?width=637&format=pjpg&auto=webp&s=adc769b7b5fa8b61128504f131f90e82801e6047",
    minElo: 1200, maxElo: 1299,
    cssClass: "tier-mtb-plus", isSpecial: false,
    rating: "6.5/10", percentile: "49.89-61.14",
  },
  {
    name: "HTB-",
    iconUrl: "https://pbs.twimg.com/media/FKS14axXIAgD8vW.jpg",
    minElo: 1300, maxElo: 1399,
    cssClass: "tier-htb-minus", isSpecial: false,
    rating: "7/10", percentile: "61.14-71.52",
  },
  {
    name: "HTB",
    iconUrl: "https://pbs.twimg.com/media/FKS14axXIAgD8vW.jpg",
    minElo: 1400, maxElo: 1499,
    cssClass: "tier-htb", isSpecial: false,
    rating: "7.5/10", percentile: "71.52-80.35",
  },
  {
    name: "HTB+",
    iconUrl: "https://i.pinimg.com/736x/a8/d1/c7/a8d1c7c53d77b74d6fda85c3cc99b1e2.jpg",
    minElo: 1500, maxElo: 1599,
    cssClass: "tier-htb-plus", isSpecial: false,
    rating: "8/10", percentile: "80.35-87.29",
  },
  {
    name: "Stacylite",
    iconUrl: "https://i.pinimg.com/736x/94/c3/e6/94c3e6e0af73d7104b4106b6586adfb4.jpg",
    minElo: 1600, maxElo: 1699,
    cssClass: "tier-stacylite", isSpecial: false,
    rating: "8.5/10", percentile: "87.29-92.30",
  },
  {
    name: "Stacy",
    iconUrl: "https://i.pinimg.com/736x/c4/52/b8/c452b87ddf6ecf4c6da59859e7d03955.jpg",
    minElo: 1700, maxElo: 1799,
    cssClass: "tier-stacy", isSpecial: false,
    rating: "9/10", percentile: "92.30-95.65",
  },
  {
    name: "High Stacy",
    iconUrl: "https://media1.giphy.com/media/v1.Y2lkPTZjMDliOTUyM3ltMjBmdDhvc2ZreGJpMDl6aHJ2aTVmd2txYXMxajBheWttMXgzdiZlcD12MV9naWZzX3NlYXJjaCZjdD1n/114J5RYbuBLRGE/giphy.gif",
    minElo: 1800, maxElo: 1899,
    cssClass: "tier-high-stacy", isSpecial: false,
    rating: "9.5/10", percentile: "95.65-97.71",
  },
  {
    name: "Evelite",
    iconUrl: "https://i.pinimg.com/736x/ca/76/13/ca7613c9f35568a4d170ccbc9a18ee2d.jpg",
    minElo: 1900, maxElo: 1999,
    cssClass: "tier-evelite", isSpecial: true,
    rating: "9.7/10", percentile: "97.71-98.88",
  },
  {
    name: "Eve",
    iconUrl: "https://i.pinimg.com/webp/736x/02/56/7d/02567d4261fe976b3a1eb9909e6e2815.webp",
    minElo: 2000, maxElo: 2099,
    cssClass: "tier-eve", isSpecial: true,
    rating: "9.9/10", percentile: "98.89-99.50",
  },
  {
    name: "True Eve",
    iconUrl: "https://i.pinimg.com/webp/1200x/a1/30/19/a1301925d86be095a3775e641da975c2.webp",
    minElo: 2100, maxElo: Infinity,
    cssClass: "tier-true-eve", isSpecial: true,
    rating: "10/10", percentile: "99.51-100.00",
  },
];

// ─── Lookup ─────────────────────────────────────────────────────────────────

export type Gender = "male" | "female";

export function getTier(elo: number, gender: Gender = "male"): TierInfo {
  const tiers = gender === "female" ? FEMALE_TIERS : MALE_TIERS;
  return tiers.find(t => elo >= t.minElo && elo <= t.maxElo) ?? tiers[0];
}

/** Get all tiers for a given gender */
export function getAllTiers(gender: Gender = "male"): TierInfo[] {
  return gender === "female" ? FEMALE_TIERS : MALE_TIERS;
}

// Keep backward compat — default to male tiers
const TIERS = MALE_TIERS;
export { TIERS, MALE_TIERS, FEMALE_TIERS };
