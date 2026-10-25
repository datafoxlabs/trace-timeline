// 子路径导出入口（Story 8.2；AD-15）：`@datafox/trace-timeline/datasources/datafox`。
// 后端中立的核心包不打包这些 DataFox 专属符号；宿主按需从本子路径引入。
export {
  fromDataFox,
  decodeDataFox,
  datafoxDataSource,
  type DataFoxResponse,
} from '../../model/adapters/fromDataFox';
export { dataFoxFixture } from '../../model/adapters/datafox-fixture';
// 可选取数助手（AD-14；仍 props 驱动，库本身不强制取数）。
export { fetchTrace, fetchTraceDetail, createDataFoxTraceUrl, type FetchTraceOptions, type FetchLike } from '../../data/datafox/client';

export { parseDataFoxTraceDetail, parseDataFoxEventTime, DataFoxTraceError, type DataFoxTraceDetail, type DataFoxEntity } from '../../model/adapters/datafoxTraceDetail';
