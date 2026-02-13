
export class FileOverlapChecker {
    private registeredFiles: Set<string>;

    constructor() {
        this.registeredFiles = new Set<string>();
    }

    /**
     * Registers a file path. Throws an error if the file is already registered.
     * @param filePath The path of the file to register (relative to the project root).
     */
    public registerFile(filePath: string): void {
        if (this.registeredFiles.has(filePath)) {
            throw new Error(`Compile-time error: File overlap detected. "${filePath}" is being written to by multiple leaves.`);
        }
        this.registeredFiles.add(filePath);
    }

    /**
     * Resets the registered files. Useful for new compilation runs.
     */
    public reset(): void {
        this.registeredFiles.clear();
    }
}
