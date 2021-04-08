export enum UpgradeType  {
  NONE = 0,     // Only applies for exact matches
  PATCH = 1,    // Allow a higher patch version
  MINOR = 2,    // Allow a higher minor version
  MAJOR = 3,    // Allow a higher major version
}

interface ITypeInfo {
  coreType: string;
  major: number;
  minor: number;
  patch: number;
  context: 'single' | 'array' | 'map' | 'set';
}

interface IRuleInfo {
  typeInfo: ITypeInfo;
  upgradeType: UpgradeType ;
  ruleData: any;
}

export class SemverMap {

  private static _compareTypes(a: ITypeInfo, b: ITypeInfo): -1 | 0 | 1 {
    if (a.major < b.major) {
      return -1;
    } else if (a.major > b.major) {
      return 1;
    } else if (a.minor < b.minor) {
      return -1;
    } else if (a.minor > b.minor) {
      return 1;
    } else if (a.patch < b.patch) {
      return -1;
    } else if (a.patch > b.patch) {
      return 1;
    }
    return 0;
  }

  private static _compareRules(a: IRuleInfo, b: IRuleInfo): -1 | 0 | 1 {
    return SemverMap._compareTypes(a.typeInfo, b.typeInfo);
  }

  private static _applies(rule: IRuleInfo, typeInfo: ITypeInfo): boolean {
    if (rule.typeInfo.major > typeInfo.major) {
      return false;
    }
    if (rule.typeInfo.major < typeInfo.major) {
      return rule.upgradeType === UpgradeType.MAJOR;
    }
    if (rule.typeInfo.minor > typeInfo.minor) {
      return false;
    }
    if (rule.typeInfo.minor < typeInfo.minor) {
      return rule.upgradeType === UpgradeType.MINOR || rule.upgradeType === UpgradeType.MAJOR;
    }
    if (rule.typeInfo.patch > typeInfo.patch) {
      return false;
    }
    if (rule.typeInfo.patch < typeInfo.patch) {
      return rule.upgradeType !== UpgradeType.NONE;
    }
    // Otherwise the rule directly applies.
    return true;
  }

  private _orderedEntries ?: Map<string, IRuleInfo[]>;
  private _parseCache = new Map<string, ITypeInfo>();
  private _rules = new Map<string, IRuleInfo>();
  private _typeToRuleCache = new Map<string, {rule?: IRuleInfo}>();

  /**
   * Return whether we have a rule for the given typeid
   *
   * @returns true if and only if there is already a rule for the type.
   */
  public has(typeid: string): boolean {
    return this._rules.has(typeid);
  }

  /**
   * Add a new rule for the given typeid. We also take in an upgrade type and the data to associate with the
   * rule.
   *
   * @returns true if and only if the rule was not a duplicate.
   */
  public add(typeid: string, upgrade: UpgradeType = UpgradeType.NONE, data: any): boolean {
    if (!this._rules.has(typeid)) {
      this._rules.set(typeid, {
        ruleData: data,
        typeInfo: this._parseTypeId(typeid),
        upgradeType: upgrade,
      });

      // Reset our caches
      this._resetCaches();
      return true;
    } else {
      return false;
    }
  }

  /**
   * Remove the rule for the provided type.
   *
   * @returns true if and only if the rule was not a duplicate.
   */
  public remove(typeid: string): boolean {
    // remove the entry
    const deleted = this._rules.delete(typeid);

    // Reset our caches
    this._resetCaches();

    return deleted;
  }

  /**
   * Find the best rule that matches the given type.
   * @returns the data that was associated with the rule.
   */
  public best(typeid: string): any | undefined {
    if (!this._orderedEntries) {
      this._orderedEntries = new Map<string, IRuleInfo[]>();

      // Fill the table with all the entries
      this._rules.forEach((rule) => {
        const list = this._orderedEntries!.get(rule.typeInfo.coreType) || [];
        list.push(rule);
        this._orderedEntries!.set(rule.typeInfo.coreType, list);
      });

      // Now sort each sub-table based on the semver rules
      this._orderedEntries.forEach((table) => {
        table.sort(SemverMap._compareRules);
      });
    }

    let lookup = this._typeToRuleCache.get(typeid);
    if (!lookup) {
      const parsed = this._parseTypeId(typeid);
      const ordered = this._orderedEntries.get(parsed.coreType);

      lookup = { rule: undefined };

      if (ordered) {
        // do a linear search. Wanted to use sortedIndex from underscore but it's weird.
        // We are caching the result so this is not likely to ever be a bottleneck
        // Find the _last_ rule that applies
        for (let i = ordered.length - 1; i >= 0; i--) {
          if (SemverMap._applies(ordered[i], parsed)) {
            lookup!.rule = ordered[i];
            break;
          }
        }
      }
      this._typeToRuleCache.set(typeid, lookup);
    }
    return lookup!.rule ? lookup!.rule.ruleData : undefined;
  }

  /**
   * Reset our caches and force recomputation
   */
  private _resetCaches() {
    this._orderedEntries = undefined;
    this._typeToRuleCache = new Map<string, {rule?: IRuleInfo}>();
  }

  /**
   * Parse the provided type and return the type broken down into core type, major, minor and patch versions.
   */
  private _parseTypeId(typeid: string): ITypeInfo {
    let entry = this._parseCache.get(typeid);
    if (!entry) {
      const contextMatch = /^(map|array|set)<([^>]+)>/.exec(typeid);
      if (contextMatch) {
        const insideType = this._parseTypeId(contextMatch[2]);
        entry = {
          context: contextMatch[1] as 'map' | 'array' | 'set',
          coreType: contextMatch[0],
          major: insideType.major,
          minor: insideType.minor,
          patch: insideType.patch,
        };
      } else {
        const match = /^([^-]+)-([0-9]+)\.([0-9]+)\.([0-9]+)$/.exec(typeid);
        if (match) {
          entry = {
            context: 'single',
            coreType: match[1],
            major: Number(match[2]),
            minor: Number(match[3]),
            patch: Number(match[4]),
          };
        } else {
          // Versionless types; we just always treat them as 1.0.0
          entry = {
            context: 'single',
            coreType: typeid,
            major: 1,
            minor: 0,
            patch: 0,
          };
        }
      }
      this._parseCache.set(typeid, entry);
    }
    return entry;
  }
}
