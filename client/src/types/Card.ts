export interface CardOption {
  uuid: string;
  name: string;
  order: number;
  imageId?: string;
  isUserUpload: boolean;
  hasBakedBleed?: boolean;
  set?: string;
  number?: string;
  lang?: string;
}

export interface ScryfallCard {
  name: string;
  imageUrls: string[];
  set?: string;
  number?: string;
  lang?: string;
}