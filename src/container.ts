import type {
  IScanner, IFileSystemReader, IVersionResolver,
  INpmClient, IOsvClient, IPopularPackagesStore,
} from './domain/repositories';
import type { SentinelConfig } from './domain/config';
import { DEFAULT_CONFIG } from './domain/config';
import { SwcScanner } from './infrastructure/SwcScanner';
import { FileSystemReader } from './infrastructure/FileSystemReader';
import { VersionResolver } from './infrastructure/VersionResolver';
import { NpmHttpClient } from './infrastructure/NpmHttpClient';
import { OsvHttpClient } from './infrastructure/OsvHttpClient';
import { PopularPackagesStore } from './infrastructure/PopularPackagesStore';
import { ScanProjectUseCase } from './application/ScanProjectUseCase';
import { GuardUseCase } from './guard/GuardUseCase';

export interface Container {
  config: SentinelConfig;
  scanner: IScanner;
  fileReader: IFileSystemReader;
  versionResolver: IVersionResolver;
  npmClient: INpmClient;
  osvClient: IOsvClient;
  popularPackagesStore: IPopularPackagesStore;
  scanUseCase: ScanProjectUseCase;
  guardUseCase: GuardUseCase;
}

export function createContainer(config: SentinelConfig = DEFAULT_CONFIG): Container {
  const fileReader = new FileSystemReader();
  const npmClient = new NpmHttpClient();
  const osvClient = new OsvHttpClient();
  const popularPackagesStore = new PopularPackagesStore(npmClient);

  return {
    config,
    scanner: new SwcScanner(),
    fileReader,
    versionResolver: new VersionResolver(fileReader),
    npmClient,
    osvClient,
    popularPackagesStore,
    scanUseCase: new ScanProjectUseCase(
      new SwcScanner(),
      fileReader,
      new VersionResolver(fileReader),
      npmClient,
      osvClient,
      config,
      popularPackagesStore,
    ),
    guardUseCase: new GuardUseCase(npmClient, osvClient),
  };
}
