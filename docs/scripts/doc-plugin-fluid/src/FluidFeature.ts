// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import yaml = require('js-yaml');
import { FileSystem } from '@rushstack/node-core-library';
import {
  MarkdownDocumenterFeature,
  IMarkdownDocumenterFeatureOnBeforeWritePageArgs,
  IMarkdownDocumenterFeatureOnFinishedArgs
} from '@microsoft/api-documenter';
import {
  CustomMarkdownEmitter
} from '@microsoft/api-documenter/lib/markdown/CustomMarkdownEmitter'

import {
  DocSection,
  DocPlainText,
  DocLinkTag,
  TSDocConfiguration,
  StringBuilder,
  // DocNodeKind,
  // DocParagraph,
  // DocCodeSpan,
  // DocFencedCode,
  // StandardTags,
  // DocBlock,
  // DocComment,
  // DocNodeContainer
} from '@microsoft/tsdoc';

import {
  // ApiModel,
  ApiItem,
  // ApiEnum,
  // ApiPackage,
  ApiItemKind,
  // ApiReleaseTagMixin,
  // ApiDocumentedItem,
  // ApiClass,
  // ReleaseTag,
  // ApiStaticMixin,
  // ApiPropertyItem,
  // ApiInterface,
  // Excerpt,
  // ApiParameterListMixin,
  // ApiReturnTypeMixin,
  // ApiDeclaredItem,
  // ApiNamespace,
  // ExcerptTokenKind,
  // IResolveDeclarationReferenceResult
} from '@microsoft/api-extractor-model';
// import { throws } from 'assert';

interface INavigationNode {
  title: string;
  url?: string;
  subitems?: INavigationNode[];
}
interface INavigationFile {
  api_nav: INavigationNode[];
}

export class FluidFeature extends MarkdownDocumenterFeature {
  private _apiItemsWithPages: Set<ApiItem> = new Set<ApiItem>();
  private _tsdocConfiguration: TSDocConfiguration = new TSDocConfiguration();
  private _markdownEmitter: CustomMarkdownEmitter;

  public onInitialized(): void {
    console.log('FluidFeature: onInitialized()');
    this._markdownEmitter = new CustomMarkdownEmitter(this.context.apiModel);
  }

  public onBeforeWritePage(eventArgs: IMarkdownDocumenterFeatureOnBeforeWritePageArgs): void {
    // Add the Hugo header
    const header: string = [
      '---',
      'title: \"' + this._pageTitle(eventArgs.apiItem) + '\"',
      'draft: false',
      '---',
      ''
    ].join('\n');
    eventArgs.pageContent = header + this._customContent(eventArgs.apiItem).toString();
    // eventArgs.pageContent;

    this._apiItemsWithPages.add(eventArgs.apiItem);
  }

  public onFinished(eventArgs: IMarkdownDocumenterFeatureOnFinishedArgs): void {
    const navigationFile: INavigationFile = {
      api_nav: [
        {
          title: 'API Reference',
          url: '/api/'
        }
      ]
    };
    this._buildNavigation(navigationFile.api_nav, this.context.apiModel);

    const navFilePath: string = path.join(this.context.outputFolder, '..', 'api_nav.yaml');
    const navFileContent: string = yaml.safeDump(navigationFile, { lineWidth: 120 });

    FileSystem.writeFile(navFilePath, navFileContent, { ensureFolderExists: true });

    const indexFilePath: string = path.join(this.context.outputFolder, '_index.md');
    const indexFileContent: string = "---\ntitle: API Docs\n---"
    FileSystem.writeFile(indexFilePath, indexFileContent, { ensureFolderExists: true })
    FileSystem.move({ sourcePath: path.join(this.context.outputFolder, 'index.md'), destinationPath: path.join(this.context.outputFolder, 'documenter.md') })
  }


  private _pageTitle(item: ApiItem): string {

    switch (item.kind) {
      case ApiItemKind.Method:
        return (item.parent!.displayName + "." + item.displayName).replace(/"/g, '');
      case ApiItemKind.Constructor:
        return (item.parent!.displayName + " constructor").replace(/"/g, '');
      default:
        return item.displayName.replace(/"/g, '');
    }
  }

  private _buildNavigation(parentNodes: INavigationNode[], parentApiItem: ApiItem): void {
    for (const apiItem of parentApiItem.members) {
      if (this._apiItemsWithPages.has(apiItem)) {
        const newNode: INavigationNode = {
          title: apiItem.displayName,
          url: path.posix
            .join('/api/', this.context.documenter.getLinkForApiItem(apiItem)!)
            .replace(/\.md$/, '')
        };
        parentNodes.push(newNode);

        const newNodeSubitems: INavigationNode[] = [];
        this._buildNavigation(newNodeSubitems, apiItem);
        if (newNodeSubitems.length > 0) {
          newNode.subitems = newNodeSubitems;
        }
      } else {
        this._buildNavigation(parentNodes, apiItem);
      }
    }
  }

  private _customContent(apiItem: ApiItem): StringBuilder {
    const output: DocSection = new DocSection({ configuration: this._tsdocConfiguration });
    const str: StringBuilder = new StringBuilder();
    this._writeBreadcrumb(output, apiItem);
    this._markdownEmitter.emit(str, output, {
      contextApiItem: apiItem,
      onGetFilenameForApiItem: (apiItemForFilename: ApiItem) => {
        return this.context.documenter.getLinkForApiItem(apiItemForFilename);
      }
    });
    return str;
    /*

    const scopedName: string = apiItem.getScopedNameWithinPackage();

    switch (apiItem.kind) {
      case ApiItemKind.Class:
        output.appendNode(new DocHeading({ configuration, title: `${scopedName} class` }));
        break;
      case ApiItemKind.Enum:
        output.appendNode(new DocHeading({ configuration, title: `${scopedName} enum` }));
        break;
      case ApiItemKind.Interface:
        output.appendNode(new DocHeading({ configuration, title: `${scopedName} interface` }));
        break;
      case ApiItemKind.Constructor:
      case ApiItemKind.ConstructSignature:
        output.appendNode(new DocHeading({ configuration, title: scopedName }));
        break;
      case ApiItemKind.Method:
      case ApiItemKind.MethodSignature:
        output.appendNode(new DocHeading({ configuration, title: `${scopedName} method` }));
        break;
      case ApiItemKind.Function:
        output.appendNode(new DocHeading({ configuration, title: `${scopedName} function` }));
        break;
      case ApiItemKind.Model:
        output.appendNode(new DocHeading({ configuration, title: `API Reference` }));
        break;
      case ApiItemKind.Namespace:
        output.appendNode(new DocHeading({ configuration, title: `${scopedName} namespace` }));
        break;
      case ApiItemKind.Package:
        console.log(`Writing ${apiItem.displayName} package`);
        const unscopedPackageName: string = PackageName.getUnscopedName(apiItem.displayName);
        output.appendNode(new DocHeading({ configuration, title: `${unscopedPackageName} package` }));
        break;
      case ApiItemKind.Property:
      case ApiItemKind.PropertySignature:
        output.appendNode(new DocHeading({ configuration, title: `${scopedName} property` }));
        break;
      case ApiItemKind.TypeAlias:
        output.appendNode(new DocHeading({ configuration, title: `${scopedName} type` }));
        break;
      case ApiItemKind.Variable:
        output.appendNode(new DocHeading({ configuration, title: `${scopedName} variable` }));
        break;
      default:
        throw new Error('Unsupported API item kind: ' + apiItem.kind);
    }

    if (ApiReleaseTagMixin.isBaseClassOf(apiItem)) {
      if (apiItem.releaseTag === ReleaseTag.Beta) {
        this._writeBetaWarning(output);
      }
    }

    if (apiItem instanceof ApiDocumentedItem) {
      const tsdocComment: DocComment | undefined = apiItem.tsdocComment;

      if (tsdocComment) {
        if (tsdocComment.deprecatedBlock) {
          output.appendNode(
            new DocNoteBox({ configuration: this._tsdocConfiguration }, [
              new DocParagraph({ configuration: this._tsdocConfiguration }, [
                new DocPlainText({
                  configuration: this._tsdocConfiguration,
                  text: 'Warning: This API is now obsolete. '
                })
              ]),
              ...tsdocComment.deprecatedBlock.content.nodes
            ])
          );
        }

        this._appendSection(output, tsdocComment.summarySection);
      }
    }

    if (apiItem instanceof ApiDeclaredItem) {
      if (apiItem.excerpt.text.length > 0) {
        output.appendNode(
          new DocParagraph({ configuration }, [
            new DocEmphasisSpan({ configuration, bold: true }, [
              new DocPlainText({ configuration, text: 'Signature:' })
            ])
          ])
        );
        output.appendNode(
          new DocFencedCode({
            configuration,
            code: apiItem.getExcerptWithModifiers(),
            language: 'typescript'
          })
        );
      }

      this._writeHeritageTypes(output, apiItem);
    }

    let appendRemarks: boolean = true;
    switch (apiItem.kind) {
      case ApiItemKind.Class:
      case ApiItemKind.Interface:
      case ApiItemKind.Namespace:
      case ApiItemKind.Package:
        this._writeRemarksSection(output, apiItem);
        appendRemarks = false;
        break;
    }

    switch (apiItem.kind) {
      case ApiItemKind.Class:
        this._writeClassTables(output, apiItem as ApiClass);
        break;
      case ApiItemKind.Enum:
        this._writeEnumTables(output, apiItem as ApiEnum);
        break;
      case ApiItemKind.Interface:
        this._writeInterfaceTables(output, apiItem as ApiInterface);
        break;
      case ApiItemKind.Constructor:
      case ApiItemKind.ConstructSignature:
      case ApiItemKind.Method:
      case ApiItemKind.MethodSignature:
      case ApiItemKind.Function:
        this._writeParameterTables(output, apiItem as ApiParameterListMixin);
        this._writeThrowsSection(output, apiItem);
        break;
      case ApiItemKind.Namespace:
        this._writePackageOrNamespaceTables(output, apiItem as ApiNamespace);
        break;
      case ApiItemKind.Model:
        this._writeModelTable(output, apiItem as ApiModel);
        break;
      case ApiItemKind.Package:
        this._writePackageOrNamespaceTables(output, apiItem as ApiPackage);
        break;
      case ApiItemKind.Property:
      case ApiItemKind.PropertySignature:
        break;
      case ApiItemKind.TypeAlias:
        break;
      case ApiItemKind.Variable:
        break;
      default:
        throw new Error('Unsupported API item kind: ' + apiItem.kind);
    }

    if (appendRemarks) {
      this._writeRemarksSection(output, apiItem);
    }

    const filename: string = path.join(this._outputFolder, this._getFilenameForApiItem(apiItem));
    const stringBuilder: StringBuilder = new StringBuilder();

    stringBuilder.append(
      '<!-- Do not edit this file. It is automatically generated by API Documenter. -->\n\n'
    );

    this._markdownEmitter.emit(stringBuilder, output, {
      contextApiItem: apiItem,
      onGetFilenameForApiItem: (apiItemForFilename: ApiItem) => {
        return this._getLinkFilenameForApiItem(apiItemForFilename);
      }
    });

    let pageContent: string = stringBuilder.toString();

    if (this._pluginLoader.markdownDocumenterFeature) {
      // Allow the plugin to customize the pageContent
      const eventArgs: IMarkdownDocumenterFeatureOnBeforeWritePageArgs = {
        apiItem: apiItem,
        outputFilename: filename,
        pageContent: pageContent
      };
      this._pluginLoader.markdownDocumenterFeature.onBeforeWritePage(eventArgs);
      pageContent = eventArgs.pageContent;
    }

    FileSystem.writeFile(filename, pageContent, {
      convertLineEndings: this._documenterConfig ? this._documenterConfig.newlineKind : NewlineKind.CrLf
    });
  */
  }

  private _writeBreadcrumb(output: DocSection, apiItem: ApiItem): void {
    output.appendNodeInParagraph(
      new DocLinkTag({
        configuration: this._tsdocConfiguration,
        tagName: '@link',
        linkText: 'Fluid API',
        urlDestination: '/api/'
      })
    );

    for (const hierarchyItem of apiItem.getHierarchy()) {
      switch (hierarchyItem.kind) {
        case ApiItemKind.Model:
        case ApiItemKind.EntryPoint:
          // We don't show the model as part of the breadcrumb because it is the root-level container.
          // We don't show the entry point because today API Extractor doesn't support multiple entry points;
          // this may change in the future.
          break;
        default:
          output.appendNodesInParagraph([
            new DocPlainText({
              configuration: this._tsdocConfiguration,
              text: ' > '
            }),
            new DocLinkTag({
              configuration: this._tsdocConfiguration,
              tagName: '@link',
              linkText: hierarchyItem.displayName,
              urlDestination: this.context.documenter.getLinkForApiItem(hierarchyItem)!.replace('./', '/api/')
            })
          ]);
      }
    }
  }

}
