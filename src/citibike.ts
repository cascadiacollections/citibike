import fetch, { Response } from 'node-fetch';

const HEADERS: { 'User-Agent': string } = { 'User-Agent': 'node-citibike/' };
const HOST_NAME: string = 'https://gbfs.citibikenyc.com/gbfs';

async function getFeeds(): Promise<Response> {
  return fetch(`${HOST_NAME}/gbfs.json`, { headers: HEADERS });
}

async function getSystemInformation(): Promise<Response> {
  return fetch(`${HOST_NAME}/en/system_information.json`, { headers: HEADERS });
}

export { getFeeds, getSystemInformation };
