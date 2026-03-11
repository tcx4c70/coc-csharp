import * as fs from 'node:fs';
import * as path from 'node:path';
import * as stream from 'node:stream';
import { promisify } from 'node:util';
import fetch from 'node-fetch';
import * as libc from 'detect-libc';
import * as unzip from 'unzip-stream';
import { ExtensionContext, window } from 'coc.nvim';

export interface INuGetPackage {
    packageName: string;
    targetRootPath: string;
    executablePath: string;
}

export class RoslynLanguageServerPackage implements INuGetPackage {
    public constructor(private _context: ExtensionContext) {
    }

    get packageName(): string {
        return `roslyn-language-server.${this.runtimeIdentifier}`;
    }

    get targetRootPath(): string {
        return path.join(this._context.storagePath, 'roslyn');
    }

    get executablePath(): string {
        return path.join('tools', 'net10.0', this.runtimeIdentifier, 'Microsoft.CodeAnalysis.LanguageServer.dll')
    }

    get runtimeIdentifier(): string {
        const platforms: Map<string, string> = new Map([
            [ 'linux', 'linux' ],
            [ 'win32', 'win' ],
            [ 'darwin', 'osx' ],
        ]);

        const archs: Map<string, string> = new Map([
            [ 'x64', 'x64' ],
            [ 'arm64', 'arm64' ],
        ]);

        const platform = platforms.get(process.platform);
        const arch = archs.get(process.arch);
        if (platform === undefined || arch === undefined) {
            throw new Error(`Unsupported platform or architecture: ${process.platform} ${process.arch}`);
        }
        if (platform === 'linux' && libc.familySync() === 'musl') {
            return `${platform}-musl-${arch}`;
        } else {
            return `${platform}-${arch}`;
        }
    }
}

interface NuGetPackageMetadata {
    versions: Array<string>
}

export class NuGetPackageDownloader {
    private _latestVersion: string | undefined;
    private _packageBaseAddress: string | undefined;

    public constructor(private _context: ExtensionContext, private _package: INuGetPackage) {
    }

    public async getLatestVersion(): Promise<string> {
        if (this._latestVersion === undefined) {
            this._latestVersion = await this.fetchLatestVersion();
        }
        return this._latestVersion;
    }

    public async download(version: string | undefined = undefined): Promise<void> {
        version = version || await this.getLatestVersion();

        const statusItem = window.createStatusBarItem(0, { progress: true });
        statusItem.text = `Downloading ${this._package.packageName} ${version}`;
        statusItem.show();

        const baseAddress = await this.getPackageBaseAddress();
        const url = `${baseAddress}${this._package.packageName.toLowerCase()}/${version}/${this._package.packageName.toLowerCase()}.${version}.nupkg`;
        const response = await fetch(url);
        if (!response.ok) {
            statusItem.hide();
            throw new Error(`Failed to download package ${this._package.packageName} ${version}: ${response.statusText}`);
        }

        let downloadSize = 0;
        const len = Number(response.headers.get('Content-Length'));
        response.body.on('data', (chunk: Buffer) => {
            downloadSize += chunk.length;
            const process = ((downloadSize / len) * 100).toFixed(2);
            statusItem.text = `Downloading ${this._package.packageName} ${version} ${process}%`;
        });

        const downloadPath = path.join(this._package.targetRootPath, version);
        if (!fs.existsSync(downloadPath)) {
            fs.mkdirSync(downloadPath, { recursive: true });
        }
        await promisify(stream.pipeline)(response.body, unzip.Extract({ path: downloadPath })).catch(e => {
            fs.rmdirSync(downloadPath, { recursive: true });
            statusItem.hide();
            throw e;
        });

        this._context.globalState.update('roslyn.version', version);

        statusItem.hide();
    }

    public async removeOldVersions(): Promise<void> {
        const newVersion = await this.getLatestVersion();
        const versions = fs.readdirSync(this._package.targetRootPath);
        for (const version of versions) {
            if (version !== newVersion) {
                fs.rm(
                    path.join(this._package.targetRootPath, version),
                    { recursive: true, force: true },
                    (err) => {
                        if (err) {
                            window.showErrorMessage(`Failed to remove old ${this._package.packageName} version: ${version}`);
                        }
                    });
            }
        }
    }

    private async getPackageBaseAddress(): Promise<string> {
        if (this._packageBaseAddress === undefined) {
            this._packageBaseAddress = await this.fetchPackageBaseAddress();
        }
        return this._packageBaseAddress;
    }

    private async fetchLatestVersion(): Promise<string> {
        const baseAddress = await this.getPackageBaseAddress();
        const url = `${baseAddress}${this._package.packageName.toLowerCase()}/index.json`;
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch latest version: ${response.statusText}`);
        }

        const metadata: NuGetPackageMetadata = await response.json();
        if (metadata.versions.length === 0) {
            throw new Error(`No versions found: ${this._package.packageName}`);
        }
        return metadata.versions[metadata.versions.length - 1];
    }

    private async fetchPackageBaseAddress(): Promise<string> {
        const response = await fetch('https://api.nuget.org/v3/index.json');
        if (!response.ok) {
            throw new Error(`Failed to fetch NuGet service index: ${response.statusText}`);
        }

        const serviceIndex = await response.json();
        const baseAddressResource = serviceIndex.resources.find((resource: any) => resource['@type'] === 'PackageBaseAddress/3.0.0');
        if (!baseAddressResource) {
            throw new Error('PackageBaseAddress resource not found in NuGet service index');
        }
        return baseAddressResource['@id'];
    }
}
