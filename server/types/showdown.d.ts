declare module 'showdown' {
  export interface ConverterOptions {
    omitExtraWLInCodeBlocks?: boolean;
    noHeaderId?: boolean;
    prefixHeaderId?: boolean | string;
    headerLevelStart?: number;
    parseImgDimensions?: boolean;
    simplifiedAutoLink?: boolean;
    excludeTrailingPunctuationFromURLs?: boolean;
    literalMidWordUnderscores?: boolean;
    literalMidWordAsterisks?: boolean;
    strikethrough?: boolean;
    tables?: boolean;
    tablesHeaderId?: boolean;
    ghCodeBlocks?: boolean;
    tasklists?: boolean;
    smoothLivePreview?: boolean;
    smartIndentationFix?: boolean;
    disableForced4SpacesIndentedSublists?: boolean;
    simpleLineBreaks?: boolean;
    requireSpaceBeforeHeadingText?: boolean;
    ghMentions?: boolean;
    ghMentionsLink?: string;
    encodeEmails?: boolean;
    openLinksInNewWindow?: boolean;
    backslashEscapesHTMLTags?: boolean;
    emoji?: boolean;
    underline?: boolean;
    completeHTMLDocument?: boolean;
    metadata?: boolean;
    splitAdjacentBlockquotes?: boolean;
  }

  export interface Extension {
    type: string;
    filter?: (text: string) => string;
    regex?: RegExp;
    replace?: string | ((match: string, ...args: any[]) => string);
  }

  export interface ShowdownExtension {
    [extensionName: string]: Extension;
  }

  export class Converter {
    constructor(options?: ConverterOptions);
    makeHtml(text: string): string;
    setOption(key: string, value: any): Converter;
    getOption(key: string): any;
    getOptions(): ConverterOptions;
    addExtension(extension: ShowdownExtension | string, name?: string): void;
    useExtension(extension: string): void;
    getAllExtensions(): {[name: string]: ShowdownExtension};
    getExtension(name: string): ShowdownExtension;
    removeExtension(name: string): void;
    setFlavor(name: string): void;
  }

  export function extension(extensionName: string, extension: ShowdownExtension): void;
}