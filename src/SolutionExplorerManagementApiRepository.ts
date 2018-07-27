import {IIdentity} from '@essential-projects/core_contracts';
import {IHttpClient} from '@essential-projects/http_contracts';
import {ExternalAccessor, ManagementApiClientService} from '@process-engine/management_api_client';
import {ManagementContext, ProcessModelExecution} from '@process-engine/management_api_contracts';
import {IDiagram, ISolution} from '@process-engine/solutionexplorer.contracts';
import {ISolutionExplorerRepository} from '@process-engine/solutionexplorer.repository.contracts';

interface IParsedDiagramUri {
  baseRoute: string;
  processModelId: string;
}

export class SolutionExplorerManagementApiRepository implements ISolutionExplorerRepository {

  private _httpClient: IHttpClient;

  private _managementApi: ManagementApiClientService;
  private _managementApiContext: ManagementContext;

  constructor(httpClient: IHttpClient) {
    this._httpClient = httpClient;
  }

  public async openPath(pathspec: string, identity: IIdentity): Promise<void> {
    if (pathspec.endsWith('/')) {
      pathspec = pathspec.substr(0, pathspec.length - 1);
    }

    const managementApi: ManagementApiClientService = this._createManagementClient(pathspec);
    const managementApiContext: ManagementContext = this._getManagementApiContext(identity);

    // test connection
    await managementApi.getProcessModels(managementApiContext);

    this._managementApi = managementApi;
    this._managementApiContext = managementApiContext;
  }

  public async getDiagrams(): Promise<Array<IDiagram>> {
    const processModels: ProcessModelExecution.ProcessModelList = await this._managementApi.getProcessModels(this._managementApiContext);

    const diagrams: Array<IDiagram> = processModels.processModels.map((processModel: ProcessModelExecution.ProcessModel) => {
      return this._mapProcessModelToDiagram(processModel, this._managementApi);
    });

    return diagrams;
  }

  public async getDiagramByName(diagramName: string): Promise<IDiagram> {
    const processModel: ProcessModelExecution.ProcessModel = await this._managementApi.getProcessModelById(this._managementApiContext, diagramName);

    const diagrams: IDiagram = this._mapProcessModelToDiagram(processModel, this._managementApi);

    return diagrams;
  }

  public async openSingleDiagram(pathToDiagram: string, identity: IIdentity): Promise<IDiagram> {
    const parsedDiagramUri: IParsedDiagramUri = this._parseDiagramUri(pathToDiagram);

    const managementApi: ManagementApiClientService = this._createManagementClient(parsedDiagramUri.baseRoute);
    const processModel: ProcessModelExecution.ProcessModel = await
      managementApi
      .getProcessModelById(this._managementApiContext, parsedDiagramUri.processModelId);

    const diagram: IDiagram = this._mapProcessModelToDiagram(processModel, managementApi);

    return diagram;
  }

  public async saveSingleDiagram(diagramToSave: IDiagram, identity: IIdentity, pathspec?: string): Promise<IDiagram> {
    const payload: ProcessModelExecution.UpdateProcessModelRequestPayload = {
      overwriteExisting: true,
      xml: diagramToSave.xml,
    };

    const managementApiContext: ManagementContext = this._getManagementApiContext(identity);

    if (pathspec) {

      const managementApi: ManagementApiClientService = this._createManagementClient(pathspec);
      await managementApi.updateProcessModelById(managementApiContext, diagramToSave.id, payload);

      return;
    }

    const parsedDiagramUri: IParsedDiagramUri = this._parseDiagramUri(diagramToSave.uri);
    await this._managementApi.updateProcessModelById(managementApiContext, parsedDiagramUri.processModelId, payload);
  }

  public async saveSolution(solution: ISolution, pathspec?: string): Promise<void> {
    if (pathspec) {

      const managementApi: ManagementApiClientService = this._createManagementClient(pathspec);

      solution.uri = pathspec;
      solution.diagrams.forEach((diagram: IDiagram) => {
        diagram.uri = `${pathspec}/${diagram.id}`;
      });

      solution.diagrams.map((diagram: IDiagram): Promise<void> => {

        const payload: ProcessModelExecution.UpdateProcessModelRequestPayload = {
          overwriteExisting: true,
          xml: diagram.xml,
        };

        return managementApi.updateProcessModelById(this._managementApiContext, diagram.id, payload);
      });

      return;
    }

    const promises: Array<Promise<void>> = solution.diagrams.map((diagram: IDiagram) => {
      return this.saveDiagram(diagram);
    });

    await Promise.all(promises);
  }

  public async saveDiagram(diagramToSave: IDiagram, pathspec?: string): Promise<void> {
    const payload: ProcessModelExecution.UpdateProcessModelRequestPayload = {
      overwriteExisting: true,
      xml: diagramToSave.xml,
    };

    if (pathspec) {

      const managementApi: ManagementApiClientService = this._createManagementClient(pathspec);
      await managementApi.updateProcessModelById(this._managementApiContext, diagramToSave.id, payload);

      return;
    }

    const parsedDiagramUri: IParsedDiagramUri = this._parseDiagramUri(diagramToSave.uri);
    await this._managementApi.updateProcessModelById(this._managementApiContext, parsedDiagramUri.processModelId, payload);
  }

  private _createManagementClient(baseRoute: string): ManagementApiClientService {
    const externalAccessor: ExternalAccessor = new ExternalAccessor(this._httpClient);
    (externalAccessor as any).baseUrl = `${baseRoute}/${(externalAccessor as any).baseUrl}`;

    const managementApi: ManagementApiClientService = new ManagementApiClientService(externalAccessor);

    return managementApi;
  }

  private _getBaseRoute(managementApi: ManagementApiClientService): string {
    return (managementApi.managementApiAccessor as any).baseUrl;
  }

  private _parseDiagramUri(uri: string): IParsedDiagramUri {
    const lastIndexOfSlash: number = uri.lastIndexOf('/');

    const baseRoute: string = uri.substring(0, lastIndexOfSlash);
    const processModelId: string = uri.substring(lastIndexOfSlash + 1, uri.length);

    return {
      baseRoute,
      processModelId,
    };
  }

  private _mapProcessModelToDiagram(processModel: ProcessModelExecution.ProcessModel, managementApi: ManagementApiClientService): IDiagram {
    const baseRoute: string = this._getBaseRoute(managementApi);

    const diagramUri: string = `${baseRoute}/${processModel.id}`;

    const diagram: IDiagram = {
      name: processModel.id,
      xml: processModel.xml,
      id: processModel.id,
      uri: diagramUri,
    };

    return diagram;
  }

  private _getManagementApiContext(identity: IIdentity): ManagementContext {
    // TODO (ph): Why does IIdentity does not have a token field?
    const accessToken: string = (identity as any).accessToken;
    const context: ManagementContext = {
      identity: accessToken,
    };

    return context;
  }
}
