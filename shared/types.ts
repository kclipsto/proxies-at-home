
export interface CardOption {
  uuid: string;
  name: string;
  order: number;
  imageId?: string | undefined;
  isUserUpload: boolean;
  hasBakedBleed?: boolean | undefined;
  set?: string | undefined;
  number?: string | undefined;
  lang?: string | undefined;
  colors?: string[];
  mana_cost?: string;
  cmc?: number;
  type_line?: string;
  rarity?: string;
}

export interface ScryfallCard {
  name: string;
  imageUrls: string[];
  set?: string | undefined;
  number?: string | undefined;
  lang?: string | undefined;
  colors?: string[];
  mana_cost?: string;
  cmc?: number;
  type_line?: string;
  rarity?: string;
}

export type CardInfo = {
  name: string;
  set?: string | undefined;
  number?: string | undefined;
  quantity?: number | undefined;
  language?: string | undefined;
};
