import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'rarityLabel' })
export class RarityLabelPipe implements PipeTransform {
  transform(rarity: number): string {
    switch (rarity) {
      case 2: return 'Rare';
      case 3: return 'Mythique';
      case 4: return 'Légendaire';
      case 5: return 'Relique';
      case 6: return 'Souvenir';
      case 7: return 'Épique';
      default: return 'Commun';
    }
  }
}
