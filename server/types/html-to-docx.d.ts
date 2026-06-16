declare module 'html-to-docx' {
  interface DocxOptions {
    title?: string;
    subject?: string;
    creator?: string;
    keywords?: string[];
    description?: string;
    lastModifiedBy?: string;
    revision?: number;
    externalStyles?: string;
    fontSize?: number;
    header?: string;
    footer?: string;
    margins?: {
      top?: number;
      right?: number;
      bottom?: number;
      left?: number;
      header?: number;
      footer?: number;
    };
  }

  function HTMLtoDOCX(
    html: string,
    headerHTML?: string | null,
    options?: DocxOptions,
    footerHTML?: string | null,
  ): Promise<Buffer>;

  export = HTMLtoDOCX;
}