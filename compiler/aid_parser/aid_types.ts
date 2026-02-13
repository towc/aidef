export type AidDocument = AidNode[];

export type AidNode = AidModule | AidParam | AidInclude | AidProse | AidComment;

export type AidModule = {
  type: 'module';
  name: string;
  content: AidNode[];
};

export type AidParam = {
  type: 'param';
  name: string;
  value: string;
};

export type AidInclude = {
  type: 'include';
  path: string;
  originalLine: string; // Store the original line for later processing
};

export type AidProse = {
  type: 'prose';
  content: string;
};

export type AidComment = {
  type: 'comment';
  content: string;
};
