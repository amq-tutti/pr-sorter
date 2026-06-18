import { config } from '../../customize/config';
import { CustomizeImporter } from '../customizeImporter/CustomizeImporter';

export function CustomizeImportRoute() {
    return <CustomizeImporter config={config}/>;
}
