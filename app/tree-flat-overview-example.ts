import { FlatTreeControl } from '@angular/cdk/tree';
import { Component, Injectable } from '@angular/core';
import {
  MatTreeFlatDataSource,
  MatTreeFlattener,
} from '@angular/material/tree';
import { BehaviorSubject, Observable, of as observableOf } from 'rxjs';
import { CdkDragDrop } from '@angular/cdk/drag-drop';
import { MatCheckboxChange } from '@angular/material';
import { SelectionModel } from '@angular/cdk/collections';
import { TreeDataService } from './service/tree-data.service';
import { TreeFunctionService } from './service/tree-function.service';
import { FileNode, FileFlatNode } from './service/tree-data.model';

/**
 * @title Tree with flat nodes
 */
@Component({
  selector: 'tree-flat-overview-example',
  templateUrl: 'tree-flat-overview-example.html',
  styleUrls: ['tree-flat-overview-example.css'],
  providers: [TreeDataService],
})
export class TreeFlatOverviewExample {
  /**Mapa de nodo plano a nodo anidado. Nos ayudara a encontrar el nodo anidado a modificar */
  flatNodeMap = new Map<FileFlatNode, FileNode>();

  /**Mapa de Nodo anidado a nodo plano. Nos ayudara a mantener el mismo objeto para su seleccion */
  nestedNodeMap = new Map<FileNode, FileFlatNode>();

  /**Un nodo padre señeccionado para ser ingresado */
  selectedParent: FileFlatNode | null = null;

  /**El nombre del nuevo item */
  newItemName = ' ';

  treeControl: FlatTreeControl<FileFlatNode>;
  treeFlattener: MatTreeFlattener<FileNode, FileFlatNode>;
  dataSource: MatTreeFlatDataSource<FileNode, FileFlatNode>;
  // expansion model tracks expansion state
  expansionModel = new SelectionModel<string>(true);
  dragging = false;
  expandTimeout: any;
  expandDelay = 1000;
  validateDrop = true;

  constructor(private database: TreeDataService) {
    this.treeFlattener = new MatTreeFlattener(
      this.transformer,
      this._getLevel,
      this._isExpandable,
      this._getChildren
    );
    this.treeControl = new FlatTreeControl<FileFlatNode>(
      this._getLevel,
      this._isExpandable
    );
    this.dataSource = new MatTreeFlatDataSource(
      this.treeControl,
      this.treeFlattener
    );

    database.dataChange.subscribe((data) => this.rebuildTreeForData(data));
  }

  transformer = (node: FileNode, level: number) => {
    const existingNode = this.nestedNodeMap.get(node);
    const flatNode =
      existingNode && existingNode.filename === node.filename
        ? existingNode
        : new FileFlatNode();
    flatNode.filename = node.filename;
    flatNode.level = level;
    flatNode.expandable = true;
    flatNode.hasChild = !!node.children?.length; //Esta propiedad nos ayudara a ocultar el boton de expandir en un nodo
    this.flatNodeMap.set(flatNode, node);
    this.nestedNodeMap.set(node, flatNode);
    return flatNode;
  };
  private _getLevel = (node: FileFlatNode) => node.level;
  private _isExpandable = (node: FileFlatNode) => node.expandable;
  private _getChildren = (node: FileNode): Observable<FileNode[]> =>
    observableOf(node.children);
  hasChild = (_: number, _nodeData: FileFlatNode) => _nodeData.expandable;
  hasNoContent = (_: number, _nodeData: FileFlatNode) =>
    _nodeData.filename === '';

  // DRAG AND DROP METHODS

  shouldValidate(event: MatCheckboxChange): void {
    this.validateDrop = event.checked;
  }

  /**
   * This constructs an array of nodes that matches the DOM
   */
  visibleNodes(): FileNode[] {
    const result = [];

    function addExpandedChildren(node: FileNode, expanded: string[]) {
      result.push(node);
      if (expanded.includes(node.id)) {
        node.children.map((child) => addExpandedChildren(child, expanded));
      }
    }
    this.dataSource.data.forEach((node) => {
      addExpandedChildren(node, this.expansionModel.selected);
    });
    return result;
  }

  /**
   * Handle the drop - here we rearrange the data based on the drop event,
   * then rebuild the tree.
   * */
  drop(event: CdkDragDrop<string[]>) {
    // console.log('origin/destination', event.previousIndex, event.currentIndex);

    // ignore drops outside of the tree
    if (!event.isPointerOverContainer) return;

    //construye una lista de nodos visibles, this emparejara con el DOM.
    // the cdkDragDrop event.currentIndex jives with visible nodes.
    //Llama rememberExpandedTreeNodes para seguir en estado expandido.
    const visibleNodes = this.visibleNodes();

    //clonamos los datos de la fuente asi podemos modificarlos
    const changedData = JSON.parse(JSON.stringify(this.dataSource.data));

    //funcion recursiva para encontrar su nodo hermano
    function findNodeSiblings(arr: Array<any>, id: string): Array<any> {
      let result, subResult;
      arr.forEach((item, i) => {
        if (item.id === id) {
          result = arr;
        } else if (item.children) {
          subResult = findNodeSiblings(item.children, id);
          if (subResult) result = subResult;
        }
      });
      return result;
    }

    //Determina donde insertar el nodo
    const nodeAtDest = visibleNodes[event.currentIndex];
    const newSiblings = findNodeSiblings(changedData, nodeAtDest.id);
    if (!newSiblings) return;
    const insertIndex = newSiblings.findIndex((s) => s.id === nodeAtDest.id);

    //Se quita el nodo de su lugar anterior
    const node = event.item.data;
    const siblings = findNodeSiblings(changedData, node.id);
    const siblingIndex = siblings.findIndex((n) => n.id === node.id);
    const nodeToInsert: FileNode = siblings.splice(siblingIndex, 1)[0];
    if (nodeAtDest.id === nodeToInsert.id) return;

    //Asegura la validacion de que el drop debe ser en el mismo nivel
    const nodeAtDestFlatNode = this.treeControl.dataNodes.find(
      (n) => nodeAtDest.id === n.id
    );
    if (this.validateDrop && nodeAtDestFlatNode.level !== node.level) {
      alert('Los items solos se pueden mover en su mismo nivel');
      return;
    }

    //Inserta un nodo
    newSiblings.splice(insertIndex, 0, nodeToInsert);

    //reconstruye el arbol con los datos modificados
    this.rebuildTreeForData(changedData);
  }

  /**
   * Experimental - opening tree nodes as you drag over them
   */
  dragStart() {
    this.dragging = true;
  }
  dragEnd() {
    this.dragging = false;
  }
  dragHover(node: FileFlatNode) {
    if (this.dragging) {
      clearTimeout(this.expandTimeout);
      this.expandTimeout = setTimeout(() => {
        this.treeControl.expand(node);
      }, this.expandDelay);
    }
  }
  dragHoverEnd() {
    if (this.dragging) {
      clearTimeout(this.expandTimeout);
    }
  }

  /**
   * The following methods are for persisting the tree expand state
   * after being rebuilt
   */

  rebuildTreeForData(data: any) {
    this.dataSource.data = data;
    this.expansionModel.selected.forEach((id) => {
      const node = this.treeControl.dataNodes.find((n) => n.id === id);
      this.treeControl.expand(node);
    });
  }

  /**
   * Not used but you might need this to programmatically expand nodes
   * to reveal a particular node
   */
  private expandNodesById(flatNodes: FileFlatNode[], ids: string[]) {
    if (!flatNodes || flatNodes.length === 0) return;
    const idSet = new Set(ids);
    return flatNodes.forEach((node) => {
      if (idSet.has(node.id)) {
        this.treeControl.expand(node);
        let parent = this.getParentNode(node);
        while (parent) {
          this.treeControl.expand(parent);
          parent = this.getParentNode(parent);
        }
      }
    });
  }

  private getParentNode(node: FileFlatNode): FileFlatNode | null {
    const currentLevel = node.level;
    if (currentLevel < 1) {
      return null;
    }
    const startIndex = this.treeControl.dataNodes.indexOf(node) - 1;
    for (let i = startIndex; i >= 0; i--) {
      const currentNode = this.treeControl.dataNodes[i];
      if (currentNode.level < currentLevel) {
        return currentNode;
      }
    }
    return null;
  }

  /**Selecciona la categoria donde podemos insertar el nuevo item */
  addnewItem(node: FileFlatNode) {
    const parentNode = this.flatNodeMap.get(node);
    this.database.insertItem(parentNode!, '');
    this.treeControl.expand(node);
  }

  /**Guarda el nodo a la base de datos */
  saveNode(node: FileFlatNode, itemValue: string) {
    const nestedNode = this.flatNodeMap.get(node);
    this.database.updateItem(nestedNode!, itemValue);
  }
}
