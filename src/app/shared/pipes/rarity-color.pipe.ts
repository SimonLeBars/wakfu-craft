import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'rarityColor' })
export class RarityColorPipe implements PipeTransform {
  transform(rarity: number): string {
    switch (rarity) {
      case 2: return '#4ade80';
      case 3: return '#f97316';
      case 4: return '#facc15';
      case 5: return '#a855f7';
      case 6: return '#60a5fa';
      case 7: return '#f472b6';
      default: return '#6b7280';
    }
  }
}
