import banlistData from "@/data/banlist.json";
import type {
  CardVariant,
  CatalogIndex,
  DeckSlot,
  DeckValidationResult,
  DeckViolation,
} from "./types";

interface BanRule {
  type: "ban";
  scope: ("main" | "life" | "side")[];
  cardNames?: string[];
  cardPrints?: string[];
  message?: string;
}

interface LimitRule {
  type: "limit";
  max: number;
  scope: ("main" | "life" | "side")[];
  cardNames?: string[];
  cardPrints?: string[];
  message?: string;
}

interface ConditionalPairRule {
  type: "conditional";
  scope: ("main" | "life" | "side")[];
  cardNamesA?: string[];
  cardPrintsA?: string[];
  cardNamesB?: string[];
  cardPrintsB?: string[];
  message?: string;
}

interface CustomRule {
  type: "custom";
  id: string;
  message?: string;
}

type BanlistRule = BanRule | LimitRule | ConditionalPairRule | CustomRule;

export interface CardBanInfo {
  type: "ban" | "limit" | "conditional" | "custom" | "illegal-ex";
  max?: number;
  message: string;
  counterparts?: string[];
}

const RULES: BanlistRule[] = banlistData.rules as BanlistRule[];

export const BANLIST_META = banlistData.meta;

function hasSymbolReference(card: CardVariant, sym: string): boolean {
  if (card.symbol === sym) return true;
  const eff = (card.mainEffect || "").toLowerCase();
  return eff.includes(`symbol ${sym}`) || eff.includes(`{${sym}}`);
}

function resolveCardForSlot(slot: DeckSlot, catalog: CatalogIndex): CardVariant | undefined {
  return (
    catalog.variantById.get(`${slot.print}__${slot.rare}`) ??
    catalog.printByCode.get(slot.print)?.primaryVariant ??
    catalog.conceptByName.get(slot.name)?.defaultVariant
  );
}

export function getCardBanInfo(card: {
  name: string;
  print: string;
  ex?: string;
}): CardBanInfo[] {
  const infos: CardBanInfo[] = [];

  if (card.ex === "ลำเอียง") {
    infos.push({
      type: "illegal-ex",
      message: "การ์ดสัญลักษณ์ 'ลำเอียง' ห้ามใช้ในการแข่งขันมาตรฐาน",
    });
  }

  for (const rule of RULES) {
    if (rule.type === "ban") {
      if (rule.cardNames?.includes(card.name) || rule.cardPrints?.includes(card.print)) {
        infos.push({
          type: "ban",
          message: rule.message || "การ์ดนี้ถูกแบนในการแข่งขัน",
        });
      }
    } else if (rule.type === "limit") {
      if (rule.cardNames?.includes(card.name) || rule.cardPrints?.includes(card.print)) {
        infos.push({
          type: "limit",
          max: rule.max,
          message: `จำกัดใส่ได้สูงสุด ${rule.max} ใบ`,
        });
      }
    } else if (rule.type === "conditional") {
      const aList = [...(rule.cardNamesA ?? []), ...(rule.cardPrintsA ?? [])];
      const bList = [...(rule.cardNamesB ?? []), ...(rule.cardPrintsB ?? [])];
      const inA = rule.cardNamesA?.includes(card.name) || rule.cardPrintsA?.includes(card.print);
      const inB = rule.cardNamesB?.includes(card.name) || rule.cardPrintsB?.includes(card.print);
      if (inA || inB) {
        const counterparts = inA ? bList : aList;
        infos.push({
          type: "conditional",
          message: rule.message || `ห้ามใส่ร่วมกับ ${counterparts.join(", ")}`,
          counterparts,
        });
      }
    } else if (rule.type === "custom" && rule.id === card.name) {
      infos.push({
        type: "custom",
        message: rule.message || "มีเงื่อนไขพิเศษในการจัดเด็ค",
      });
    }
  }
  return infos;
}

export function validateCompetitiveDeck(
  deck: { main: DeckSlot[]; life: DeckSlot[]; side: DeckSlot[] },
  catalog: CatalogIndex
): DeckValidationResult {
  const violations: DeckViolation[] = [];

  type ResolvedSlot = { slot: DeckSlot; card: CardVariant };

  const resolveList = (slots: DeckSlot[], section: "main" | "life" | "side"): ResolvedSlot[] => {
    const out: ResolvedSlot[] = [];
    for (const s of slots) {
      const card = resolveCardForSlot(s, catalog);
      if (!card) {
        violations.push({
          rule: `unknown-card-${section}`,
          severity: "error",
          message: `ไม่พบข้อมูลการ์ด "${s.name || s.print}" ในฐานข้อมูลทางการ`,
          names: [s.name],
          prints: [s.print],
        });
        continue;
      }
      out.push({ slot: s, card });
    }
    return out;
  };

  const mainResolved = resolveList(deck.main, "main");
  const lifeResolved = resolveList(deck.life, "life");
  const sideResolved = resolveList(deck.side, "side");

  const mainCount = deck.main.reduce((acc, s) => acc + s.quantity, 0);
  const lifeCount = deck.life.reduce((acc, s) => acc + s.quantity, 0);
  const sideCount = deck.side.reduce((acc, s) => acc + s.quantity, 0);

  // 1. Deck size constraints
  if (mainCount !== 50) {
    violations.push({
      rule: "deck-size-main",
      severity: "error",
      message: `Main Deck ต้องมีครบ 50 ใบพอดี (ปัจจุบัน ${mainCount} ใบ)`,
    });
  }

  if (lifeCount !== 5) {
    violations.push({
      rule: "deck-size-life",
      severity: "error",
      message: `Life Deck ต้องมีครบ 5 ใบ (ปัจจุบัน ${lifeCount} ใบ)`,
    });
  }

  if (sideCount > 10) {
    violations.push({
      rule: "deck-size-side",
      severity: "error",
      message: `Side Deck ต้องมีไม่เกิน 10 ใบ (ปัจจุบัน ${sideCount} ใบ)`,
    });
  }

  // 2. Card Type Placement & Token / ลำเอียง Checks
  for (const { card } of mainResolved) {
    if (card.type === "Life") {
      violations.push({
        rule: "no-life-in-main",
        severity: "error",
        message: `ห้ามใส่การ์ด Life (${card.name}) ใน Main Deck`,
        names: [card.name],
      });
    }
    if (card.type === "Token") {
      violations.push({
        rule: "no-token",
        severity: "error",
        message: `ห้ามใส่การ์ด Token (${card.name}) ในเด็ค`,
        names: [card.name],
      });
    }
    if (card.ex === "ลำเอียง") {
      violations.push({
        rule: "banned-symbol-lam-eiang",
        severity: "error",
        message: `การ์ด ${card.name} มีสัญลักษณ์ "ลำเอียง" ห้ามใช้ในการแข่งขัน`,
        names: [card.name],
      });
    }
  }

  const lifeNameCounts = new Map<string, number>();
  for (const { slot, card } of lifeResolved) {
    if (card.type !== "Life") {
      violations.push({
        rule: "only-life-in-life-deck",
        severity: "error",
        message: `Life Deck ใส่ได้เฉพาะการ์ดประเภท Life (${card.name} เป็น ${card.type})`,
        names: [card.name],
      });
    }
    if (card.ex === "ลำเอียง") {
      violations.push({
        rule: "banned-symbol-lam-eiang",
        severity: "error",
        message: `การ์ด Life ${card.name} มีสัญลักษณ์ "ลำเอียง" ห้ามใช้ในการแข่งขัน`,
        names: [card.name],
      });
    }
    lifeNameCounts.set(card.name, (lifeNameCounts.get(card.name) ?? 0) + slot.quantity);
  }

  for (const [name, qty] of lifeNameCounts.entries()) {
    if (qty > 1) {
      violations.push({
        rule: "life-unique-names",
        severity: "error",
        message: `Life Deck ห้ามใส่ชื่อซ้ำ (${name} มี ${qty} ใบ)`,
        names: [name],
      });
    }
  }

  for (const { card } of sideResolved) {
    if (card.type === "Life") {
      violations.push({
        rule: "no-life-in-side",
        severity: "error",
        message: `Side Deck ห้ามใส่การ์ด Life (${card.name})`,
        names: [card.name],
      });
    }
    if (card.type === "Token") {
      violations.push({
        rule: "no-token",
        severity: "error",
        message: `Side Deck ห้ามใส่การ์ด Token (${card.name})`,
        names: [card.name],
      });
    }
    if (card.ex === "ลำเอียง") {
      violations.push({
        rule: "banned-symbol-lam-eiang",
        severity: "error",
        message: `การ์ด ${card.name} ใน Side Deck มีสัญลักษณ์ "ลำเอียง" ห้ามใช้ในการแข่งขัน`,
        names: [card.name],
      });
    }
  }

  // 3. Only #1 mandatory check in Main Deck
  const onlyOneMainNames = new Set<string>();
  let onlyOneMainCount = 0;
  for (const { slot, card } of mainResolved) {
    if (card.ex === "Only #1") {
      onlyOneMainNames.add(card.name);
      onlyOneMainCount += slot.quantity;
    }
  }
  if (onlyOneMainCount !== 1) {
    violations.push({
      rule: "main-only-one-required",
      severity: "error",
      message:
        onlyOneMainCount === 0
          ? "Main Deck ต้องมีการ์ด Only #1 บังคับ 1 ใบ (ปัจจุบัน 0 ใบ)"
          : `Main Deck มีการ์ด Only #1 ได้เพียง 1 ใบเท่านั้น (ปัจจุบัน ${onlyOneMainCount} ใบ)`,
      names: Array.from(onlyOneMainNames),
    });
  }

  const onlyOneSideNames = new Set<string>();
  let onlyOneSideCount = 0;
  for (const { slot, card } of sideResolved) {
    if (card.ex === "Only #1") {
      onlyOneSideNames.add(card.name);
      onlyOneSideCount += slot.quantity;
    }
  }
  if (onlyOneSideCount > 1) {
    violations.push({
      rule: "side-only-one-limit",
      severity: "error",
      message: `Side Deck มีการ์ด Only #1 ได้ไม่เกิน 1 ใบ (ปัจจุบัน ${onlyOneSideCount} ใบ)`,
      names: Array.from(onlyOneSideNames),
    });
  }

  // 4. Combined Name Copy Limits (Main + Side <= 4, or Only #1 <= 1, or customLimit, or Banlist Limit)
  const mainAndSide = [...mainResolved, ...sideResolved];
  const combinedByName = new Map<string, { qty: number; maxAllowed: number; prints: string[] }>();

  const banLimitByName = new Map<string, number>();
  for (const rule of RULES) {
    if (rule.type === "limit") {
      for (const n of rule.cardNames ?? []) {
        const prev = banLimitByName.get(n);
        banLimitByName.set(n, prev !== undefined ? Math.min(prev, rule.max) : rule.max);
      }
    }
  }

  for (const { slot, card } of mainAndSide) {
    const baseMax =
      card.ex === "Only #1"
        ? 1
        : typeof card.customLimit === "number" && card.customLimit > 0
        ? card.customLimit
        : 4;
    const sinLimit = banLimitByName.get(card.name);
    const effectiveMax = sinLimit !== undefined ? Math.min(baseMax, sinLimit) : baseMax;

    const prev = combinedByName.get(card.name);
    if (prev) {
      prev.qty += slot.quantity;
      prev.maxAllowed = Math.min(prev.maxAllowed, effectiveMax);
      if (!prev.prints.includes(card.print)) prev.prints.push(card.print);
    } else {
      combinedByName.set(card.name, {
        qty: slot.quantity,
        maxAllowed: effectiveMax,
        prints: [card.print],
      });
    }
  }

  for (const [name, info] of combinedByName.entries()) {
    if (info.qty > info.maxAllowed) {
      const isSinRestricted = banLimitByName.has(name);
      violations.push({
        rule: isSinRestricted ? `sin-limit-${name}` : `copy-limit-${name}`,
        severity: "error",
        message: isSinRestricted
          ? `[การ์ดบาปจำกัดจำนวน] ${name} ใส่ได้สูงสุด ${info.maxAllowed} ใบใน Main+Side (ปัจจุบัน ${info.qty} ใบ)`
          : `การ์ด ${name} รวม Main+Side เกิน ${info.maxAllowed} ใบ (ปัจจุบัน ${info.qty} ใบ)`,
        names: [name],
        prints: info.prints,
      });
    }
  }

  // 5. Sin-List Rules: BANNED, CHOICE_PAIR_BAN, and CUSTOM CONDITIONAL
  const countInScope = (scope: ("main" | "life" | "side")[], name: string): number => {
    let total = 0;
    if (scope.includes("main")) {
      total += mainResolved.filter((r) => r.card.name === name).reduce((a, b) => a + b.slot.quantity, 0);
    }
    if (scope.includes("life")) {
      total += lifeResolved.filter((r) => r.card.name === name).reduce((a, b) => a + b.slot.quantity, 0);
    }
    if (scope.includes("side")) {
      total += sideResolved.filter((r) => r.card.name === name).reduce((a, b) => a + b.slot.quantity, 0);
    }
    return total;
  };

  for (const rule of RULES) {
    if (rule.type === "ban") {
      for (const name of rule.cardNames ?? []) {
        if (countInScope(rule.scope, name) > 0) {
          violations.push({
            rule: `sin-ban-${name}`,
            severity: "error",
            message: `[การ์ดบาปถูกแบน] ห้ามใส่ "${name}" ในเด็คแข่งขัน`,
            names: [name],
          });
        }
      }
    } else if (rule.type === "conditional") {
      const hasA = (rule.cardNamesA ?? []).some((n) => countInScope(rule.scope, n) > 0);
      const hasB = (rule.cardNamesB ?? []).some((n) => countInScope(rule.scope, n) > 0);
      if (hasA && hasB) {
        violations.push({
          rule: `sin-pair-${(rule.cardNamesA ?? []).join(",")}`,
          severity: "error",
          message:
            rule.message ||
            `[การ์ดบาปห้ามใส่คู่กัน] ไม่สามารถใส่ ${(rule.cardNamesA ?? []).join(", ")} ร่วมกับ ${(rule.cardNamesB ?? []).join(", ")}`,
          names: [...(rule.cardNamesA ?? []), ...(rule.cardNamesB ?? [])],
        });
      }
    } else if (rule.type === "custom") {
      if (rule.id === "เมียพระอิศวร") {
        const present = mainAndSide.some((r) => r.card.name === "เมียพระอิศวร");
        if (present) {
          const invalidAvatars = mainAndSide.filter(
            (r) =>
              r.card.type === "Avatar" &&
              r.card.name !== "เมียพระอิศวร" &&
              !hasSymbolReference(r.card, "เทพ")
          );
          if (invalidAvatars.length > 0) {
            violations.push({
              rule: "custom-เมียพระอิศวร",
              severity: "error",
              message:
                rule.message ||
                "ถ้าใส่ เมียพระอิศวร Avatar ทุกใบในเด็คต้องมี Symbol เทพ หรืออ้างถึง Symbol เทพ",
              names: ["เมียพระอิศวร", ...invalidAvatars.map((a) => a.card.name)],
            });
          }
        }
      } else if (rule.id === "ดาบศักดิ์สิทธิ์ เอกซ์คาลิเบอร์") {
        const present = mainAndSide.some(
          (r) => r.card.name === "ดาบศักดิ์สิทธิ์ เอกซ์คาลิเบอร์"
        );
        if (present) {
          const invalidAvatars = mainAndSide.filter(
            (r) =>
              r.card.type === "Avatar" &&
              !r.card.name.includes("อัศวินโต๊ะกลม") &&
              r.card.mainEffect !== "" &&
              !r.card.mainEffect.toLowerCase().includes("อัศวินโต๊ะกลม")
          );
          if (invalidAvatars.length > 0) {
            violations.push({
              rule: "custom-ดาบศักดิ์สิทธิ์ เอกซ์คาลิเบอร์",
              severity: "error",
              message:
                rule.message ||
                'ถ้าใส่ ดาบศักดิ์สิทธิ์ เอกซ์คาลิเบอร์ Avatar ทุกใบต้องมีคำว่า "อัศวินโต๊ะกลม"',
              names: [
                "ดาบศักดิ์สิทธิ์ เอกซ์คาลิเบอร์",
                ...invalidAvatars.map((a) => a.card.name),
              ],
            });
          }
        }
      } else if (rule.id === "สัญญาเลือด") {
        const present = mainAndSide.some((r) => r.card.name === "สัญญาเลือด");
        if (present) {
          const onlyOne = mainAndSide.find((r) => r.card.ex === "Only #1");
          if (onlyOne && onlyOne.card.type !== "Life" && onlyOne.card.symbol !== "นรก") {
            violations.push({
              rule: "custom-สัญญาเลือด",
              severity: "error",
              message:
                rule.message || "ถ้าใส่ สัญญาเลือด การ์ด Only #1 ต้องเป็น Symbol นรก เท่านั้น",
              names: ["สัญญาเลือด", onlyOne.card.name],
            });
          }
        }
      }
    }
  }

  return {
    isValid: violations.length === 0,
    isTournamentReady:
      violations.length === 0 && mainCount === 50 && lifeCount === 5 && onlyOneMainCount === 1,
    mainCount,
    lifeCount,
    sideCount,
    onlyOneMainCount,
    violations,
  };
}
