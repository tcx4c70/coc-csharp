import * as ch from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as stream from 'node:stream';
import { promisify } from 'node:util';
import fetch from 'node-fetch';
import * as libc from 'detect-libc';
import * as unzip from 'unzip-stream';
import { ExtensionContext, window } from 'coc.nvim';

const apiVersion = '7.1-preview.1';

const platforms: Map<string, string> = new Map([
    [ 'linux', 'linux' ],
    [ 'win32', 'win' ],
    [ 'darwin', 'osx' ],
]);

const archs: Map<string, string> = new Map([
    [ 'x64', 'x64' ],
    [ 'arm64', 'arm64' ],
]);

// The following interfaces are extracted from the Azure DevOps REST API: https://learn.microsoft.com/en-us/rest/api/azure/devops/artifacts/artifact-details/get-packages?view=azure-devops-rest-7.1
// Only the necessary fields are included here.
interface AzureDevOpsPackageVersion {
    id: string;
    normalizedVersion: string;
    version: string;
    isLatest: boolean;
    isListed: boolean;
    storageId: string;
    publishDate: string;
}

interface AzureDevOpsPackage {
    id: string;
    name: string;
    normalizedName: string;
    protocolType: string;
    url: string;
    versions: Array<AzureDevOpsPackageVersion>;
}

interface AzureDevOpsPackageList {
    count: number;
    value: Array<AzureDevOpsPackage>;
}

export function getRuntimeIdentifier(): string {
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

export async function getLatestVersion(): Promise<string> {
    // REST API: https://learn.microsoft.com/en-us/rest/api/azure/devops/artifacts/artifact-details/get-packages?view=azure-devops-rest-7.1
    const runtime = getRuntimeIdentifier();
    const packageName = `Microsoft.CodeAnalysis.LanguageServer.${runtime}`;
    const url = `https://feeds.dev.azure.com/azure-public/vside/_apis/packaging/feeds/vs-impl/packages?packageNameQuery=${packageName}&api-version=${apiVersion}`;
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch latest version: ${response.statusText}`);
    }

    const packages: AzureDevOpsPackageList = await response.json();
    if (packages.count === 0) {
        throw new Error(`No packages found: ${packageName}`);
    }
    const latestVersion = packages.value[0].versions.filter((version) => version.isLatest);
    if (latestVersion.length === 0) {
        throw new Error(`No latest version found: ${packageName}`);
    }
    return latestVersion[0].normalizedVersion;
}

export async function downloadServer(context: ExtensionContext, version: string): Promise<void> {
    // REST API: https://learn.microsoft.com/en-us/rest/api/azure/devops/artifactspackagetypes/nuget/download-package?view=azure-devops-rest-7.1
    const runtime = getRuntimeIdentifier();
    const packageName = `Microsoft.CodeAnalysis.LanguageServer.${runtime}`;

    const statusItem = window.createStatusBarItem(0, { progress: true });
    statusItem.text = `Downloading ${packageName} ${version}`;
    statusItem.show();

    const url = `https://pkgs.dev.azure.com/azure-public/vside/_apis/packaging/feeds/vs-impl/nuget/packages/${packageName}/versions/${version}/content?api-version=7.1-preview.1`
    const response = await fetch(url);
    if (!response.ok) {
        statusItem.hide();
        throw new Error(`Failed to download package: ${packageName} ${version}`);
    }

    let downloadSize = 0;
    const len = Number(response.headers.get('Content-Length'));
    response.body.on('data', (chunk: Buffer) => {
        downloadSize += chunk.length;
        const process = ((downloadSize / len) * 100).toFixed(2);
        statusItem.text = `Downloading ${packageName} ${version} ${process}%`;
    });

    const serverRootPath = path.join(context.storagePath, 'roslyn');
    const downloadPath = path.join(serverRootPath, version);
    if (!fs.existsSync(downloadPath)) {
        fs.mkdirSync(downloadPath, { recursive: true });
    }
    await promisify(stream.pipeline)(response.body, unzip.Extract({ path: downloadPath })).catch(e => {
        fs.rmdirSync(downloadPath, { recursive: true });
        statusItem.hide();
        throw e;
    });

    context.globalState.update('roslyn.version', version);

    // TODO: Remove all other dirs under serverRootPath? <2024-11-19, Adam Tao> //

    statusItem.hide();
}
