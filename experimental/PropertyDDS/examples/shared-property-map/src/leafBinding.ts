import { DataBinding } from "@fluid-experimental/property-binder";
import { ModificationContext } from "@fluid-experimental/property-binder/dist/data_binder/modificationContext";
import { LeafController } from "./leafController";

export class LeafBinding extends DataBinding {

    public removeLeaf(key: string, context: any) {
        const controller = this.getRepresentation<LeafController>();
        controller.remove(key);
    }

    public insertLeaf(key: string, context: ModificationContext) {
        if (context.getNestedChangeSet()) {
            const controller = this.getRepresentation<LeafController>();
            const changeSet = context.getNestedChangeSet();
            if (changeSet.String) {
                const payload = changeSet.String.payload;
                controller.insert(key, payload);
            }
        }
    }

    public updateLeaf(key: string, context: ModificationContext) {
        if (context.getNestedChangeSet()) {
            const controller = this.getRepresentation<LeafController>();
            const changeSet = context.getNestedChangeSet();
            // const absolutePath = context.getAbsolutePath();
            // const relativePath = context.getRelativeTokenizedPath();
            // console.log(`Abs path ${absolutePath}`);
            // console.log(`Relative path ${relativePath}`);
            // console.log(JSON.stringify(changeSet, null, 2));
            if (changeSet.String) {
                const payload = changeSet.String.payload;
                controller.update(key, payload);
            }
        }
    }

    static initialize() {
        this.registerOnPath("leaves", ["collectionModify"], this.prototype.updateLeaf);
        this.registerOnPath("leaves", ["collectionInsert"], this.prototype.insertLeaf);
        this.registerOnPath("leaves", ["collectionRemove"], this.prototype.removeLeaf);
    }
}

LeafBinding.initialize();