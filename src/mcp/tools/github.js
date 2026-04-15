import { Tool } from '@modelcontextprotocol/sdk/types.js';

export const GITHUB_USERNAME = 'jobchirino';

export const listRepositoriesTool = {
  name: 'list_repositories',
  description: 'Lista todos los repositorios públicos de jobchirino en GitHub. Úsala cuando necesites saber qué proyectos existen o cuando no recuerdes el nombre exacto de un repositorio.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
};

export const getReadmeTool = {
  name: 'get_readme',
  description: 'Obtiene el README completo de un repositorio de jobchirino. Usa el nombre EXACTO del repositorio que aparece en la lista. Devuelve información detallada sobre el proyecto, tecnologías usadas, instalación, etc.',
  inputSchema: {
    type: 'object',
    properties: {
      repo_name: {
        type: 'string',
        description: 'El nombre exacto del repositorio en GitHub (ej: cesarAugustoApp, trainy-app, cinema-website-react)',
      },
    },
    required: ['repo_name'],
  },
};

export async function listRepositories() {
  try {
    const res = await fetch(`https://api.github.com/users/${GITHUB_USERNAME}/repos?sort=updated&per_page=30`, {
      headers: { 'User-Agent': 'Repositories-AI-Bot' },
    });
    if (!res.ok) {
      return { content: [{ type: 'text', text: 'Error al consultar la API de GitHub.' }] };
    }
    const repos = await res.json();
    if (!Array.isArray(repos)) {
      return { content: [{ type: 'text', text: 'Error al procesar la lista de repositorios.' }] };
    }
    const formattedRepos = repos.map((repo) => `${repo.name}: ${repo.description || 'Sin descripción'} (${repo.language || 'N/A'})`).join('\n');
    return { content: [{ type: 'text', text: formattedRepos }] };
  } catch (error) {
    console.error('Error en list_repositories:', error);
    return { content: [{ type: 'text', text: 'Error de conexión con GitHub.' }] };
  }
}

export async function getReadme(repo_name) {
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_USERNAME}/${repo_name}/readme`, {
      headers: { 'User-Agent': 'Repositories-AI-Bot', Accept: 'application/vnd.github.v3.raw' },
    });
    if (!res.ok) {
      if (res.status === 404) {
        return { content: [{ type: 'text', text: `El repositorio "${repo_name}" no fue encontrado o no tiene README.` }] };
      }
      return { content: [{ type: 'text', text: 'Error al consultar este repositorio.' }] };
    }
    const content = await res.text();
    return { content: [{ type: 'text', text: content.slice(0, 10000) }] };
  } catch (error) {
    console.error('Error en get_readme:', error);
    return { content: [{ type: 'text', text: 'Error de conexión con GitHub.' }] };
  }
}
