// assets
import { BgColorsOutlined, DashboardOutlined, FileTextOutlined } from '@ant-design/icons';

// icons
const icons = {
  DashboardOutlined,
  BgColorsOutlined,
  FileTextOutlined
};

// ==============================|| MENU ITEMS - DASHBOARD ||============================== //

const dashboard = {
  id: 'group-dashboard',
  title: 'Navigation',
  type: 'group',
  children: [
    {
      id: 'placeholder-1',
      title: 'Placeholder 01',
      type: 'item',
      url: '/dashboard/default',
      icon: icons.DashboardOutlined,
      breadcrumbs: false
    },
    {
      id: 'placeholder-2',
      title: 'Placeholder 02',
      type: 'item',
      url: '/color',
      icon: icons.BgColorsOutlined,
      breadcrumbs: false
    },
    {
      id: 'placeholder-3',
      title: 'Placeholder 03',
      type: 'item',
      url: '/sample-page',
      icon: icons.FileTextOutlined,
      breadcrumbs: false
    }
  ]
};

export default dashboard;
