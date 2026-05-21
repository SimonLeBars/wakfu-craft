import { Injectable, signal } from '@angular/core';
import { RecipeCategory } from '@electron';

@Injectable({ providedIn: 'root' })
export class ProfessionProfileService {
  readonly levels       = signal<Record<number, number>>({});
  readonly categories   = signal<RecipeCategory[]>([]);
  readonly guildXpBonus = signal<number>(0);

  async load(): Promise<void> {
    const [levels, categories, guildXpBonus] = await Promise.all([
      window.electronAPI.getProfessionLevels(),
      window.electronAPI.getRecipeCategories(),
      window.electronAPI.getGuildXpBonus(),
    ]);
    this.levels.set(levels);
    this.categories.set(categories);
    this.guildXpBonus.set(guildXpBonus);
  }

  getLevel(categoryId: number): number {
    return this.levels()[categoryId] ?? 1;
  }

  async setLevel(categoryId: number, level: number): Promise<void> {
    const next = { ...this.levels(), [categoryId]: level };
    this.levels.set(next);
    await window.electronAPI.setProfessionLevels(next);
  }

  async setGuildXpBonus(bonus: number): Promise<void> {
    this.guildXpBonus.set(bonus);
    await window.electronAPI.setGuildXpBonus(bonus);
  }
}
