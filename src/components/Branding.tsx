import { assetUrl } from '../core/assets';

export function Branding() {
  return <><img className="brand brand-left" src={assetUrl('/static/img/hkiit-logo.png')} alt="HKIIT" /><img className="brand brand-right" src={assetUrl('/static/img/it114115-logo.png')} alt="IT114115" /></>;
}
