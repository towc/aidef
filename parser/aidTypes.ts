// aidTypes.ts

export type AidNode = AidModule | AidParam | AidInclude | AidProse;

export interface AidModule {
  type: 'module';
  name: string;
  instructions: AidNode[];
}

export interface AidParam {
  type: 'param';
  name: string;
  value: string;
  warning?: string; // For unknown params
}

export interface AidInclude {
  type: 'include';
  path: string;
  content: AidNode[]; // Parsed content of the included file
  warning?: string; // For non-.aid files or .gen.aid includes
}

export interface AidProse {
  type: 'prose';
  content: string;
}
