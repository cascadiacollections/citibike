import fetch from 'node-fetch';

// 'User-Agent': 'node-citibike/'

async function getFeeds(): Promise<any> {
  return fetch('https://gbfs.citibikenyc.com/gbfs/gbfs.json', {});
}

async function getSystemInformation(): Promise<any> {
  return fetch('https://gbfs.citibikenyc.com/gbfs/en/system_information.json', {});
}

export { getFeeds, getSystemInformation };
